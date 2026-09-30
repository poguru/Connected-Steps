import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";

function sane(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/<[^>]*>/g, "").trim();
  return s.length ? s : null;
}

async function getEvent(db: ReturnType<typeof getSupabaseServer>) {
  const { data } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single<{ id: string }>();
  return data;
}

// GET /api/it-run/admin/bib-slots
// Returns slots with live_booked_count from actual it_run_bib_bookings records.
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: slots, error } = await db
    .from("it_run_bib_slots")
    .select("*")
    .eq("event_id", event.id)
    .order("slot_date")
    .order("start_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Live booked count from actual bookings (not the denormalized counter which may be stale)
  const slotIds = (slots ?? []).map(s => (s as Record<string, string>).id);
  const liveMap: Record<string, number> = {};

  if (slotIds.length > 0) {
    const { data: bookings } = await db
      .from("it_run_bib_bookings")
      .select("slot_id")
      .in("slot_id", slotIds)
      .eq("status", "confirmed");

    for (const b of (bookings ?? []) as Array<{ slot_id: string }>) {
      liveMap[b.slot_id] = (liveMap[b.slot_id] ?? 0) + 1;
    }
  }

  const data = (slots ?? []).map(s => ({
    ...(s as object),
    live_booked_count: liveMap[(s as Record<string, string>).id] ?? 0,
  }));

  return NextResponse.json({ data });
}

// POST /api/it-run/admin/bib-slots — create a new slot
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  const date  = sane(body.slot_date);
  const start = sane(body.start_time);
  const end   = sane(body.end_time);
  const loc   = sane(body.location);
  const addr  = sane(body.location_address ?? null);
  const cap   = Number(body.capacity);

  if (!date)                              return NextResponse.json({ error: "slot_date is required" }, { status: 400 });
  if (!start)                             return NextResponse.json({ error: "start_time is required" }, { status: 400 });
  if (!end)                               return NextResponse.json({ error: "end_time is required" }, { status: 400 });
  if (!loc)                               return NextResponse.json({ error: "location is required" }, { status: 400 });
  if (!cap || cap < 1 || !Number.isInteger(cap))
                                          return NextResponse.json({ error: "capacity must be a positive integer" }, { status: 400 });
  if (start >= end)                       return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });

  const db    = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_bib_slots")
    .insert({
      event_id: event.id, slot_date: date, start_time: start, end_time: end,
      location_name: loc, location_address: addr, capacity: cap, booked_count: 0, is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "create_bib_slot", entity_type: "bib_slot",
    entity_id: (data as Record<string, string>)?.id ?? null,
    ip: getClientIp(req),
    detail: { slot_date: date, start_time: start, end_time: end, location_name: loc, capacity: cap },
  });

  return NextResponse.json({ data: { ...(data as object), live_booked_count: 0 } }, { status: 201 });
}

// PATCH /api/it-run/admin/bib-slots — full slot edit
// Accepts any combination of: slot_date, start_time, end_time, location_name,
// location_address, capacity, is_active. Never writes booked_count (owned by RPCs).
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id } = body;
  if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });

  const db    = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Fetch current row — event_id equality enforces IDOR protection
  const { data: current } = await db
    .from("it_run_bib_slots")
    .select("*")
    .eq("id", id)
    .eq("event_id", event.id)
    .single<Record<string, unknown>>();

  if (!current) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  // Live booked count for capacity validation
  const { count: live } = await db
    .from("it_run_bib_bookings")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", id)
    .eq("status", "confirmed");
  const bookedCount = live ?? 0;

  const updates: Record<string, unknown> = {};

  if (body.slot_date        !== undefined) updates.slot_date        = sane(body.slot_date);
  if (body.start_time       !== undefined) updates.start_time       = sane(body.start_time);
  if (body.end_time         !== undefined) updates.end_time         = sane(body.end_time);
  if (body.location_name    !== undefined) updates.location_name    = sane(body.location_name);
  if (body.location_address !== undefined) updates.location_address = sane(body.location_address) ?? null;
  if (body.is_active        !== undefined) updates.is_active        = Boolean(body.is_active);

  if (body.capacity !== undefined) {
    const newCap = Number(body.capacity);
    if (!newCap || newCap < 1 || !Number.isInteger(newCap))
      return NextResponse.json({ error: "capacity must be a positive integer" }, { status: 400 });
    if (newCap < bookedCount)
      return NextResponse.json(
        { error: `Capacity cannot be reduced below the current booked count of ${bookedCount}.` },
        { status: 400 },
      );
    updates.capacity = newCap;
  }

  // Time order validation
  const effStart = (updates.start_time as string | null) ?? (current.start_time as string);
  const effEnd   = (updates.end_time   as string | null) ?? (current.end_time   as string);
  if (effStart && effEnd && effStart >= effEnd)
    return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const old: Record<string, unknown> = {};
  for (const k of Object.keys(updates)) old[k] = current[k] ?? null;

  const { data, error } = await db
    .from("it_run_bib_slots").update(updates).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "update_bib_slot", entity_type: "bib_slot", entity_id: id,
    ip: getClientIp(req),
    detail: { updated_fields: Object.keys(updates), old_values: old, new_values: updates },
  });

  return NextResponse.json({ data: { ...(data as object), live_booked_count: bookedCount } });
}

// DELETE /api/it-run/admin/bib-slots
// Safe deletion: only allowed when the slot has zero confirmed bookings.
export async function DELETE(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db    = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // IDOR guard
  const { data: slot } = await db
    .from("it_run_bib_slots")
    .select("id, location_name")
    .eq("id", id)
    .eq("event_id", event.id)
    .single<{ id: string; location_name: string }>();

  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  const { count: live } = await db
    .from("it_run_bib_bookings")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", id)
    .eq("status", "confirmed");

  if ((live ?? 0) > 0)
    return NextResponse.json(
      { error: `This slot has ${live} existing booking${live === 1 ? "" : "s"} and cannot be deleted. You can disable it instead.` },
      { status: 409 },
    );

  const { error } = await db.from("it_run_bib_slots").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "delete_bib_slot", entity_type: "bib_slot", entity_id: id,
    ip: getClientIp(req),
    detail: { location_name: slot.location_name },
  });

  return NextResponse.json({ ok: true });
}
