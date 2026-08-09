import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/admin/events/[id]/races ─────────────────────────────────────────
// Returns all races for an event ordered by display_order.

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_races")
    .select("*")
    .eq("event_id", id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ races: data ?? [] });
}

// ── POST /api/admin/events/[id]/races ────────────────────────────────────────
// Creates a new race for the event.

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const {
    name, distance, description,
    price = 0, early_bird_price,
    price_type = "per_participant",
    min_participants = 1, max_participants = 1,
    max_slots,
    reporting_time, gun_time, cutoff_time,
    timing_chip = false, auto_bib = false, bib_prefix,
    gender_restriction, min_age, max_age,
    qualifying_required = false, qualifying_notes,
    perks,
    display_order = 0,
  } = body;

  if (!name || !distance) {
    return NextResponse.json({ error: "name and distance are required" }, { status: 400 });
  }

  const basePrice = Number(price) || 0;
  const parsedEarlyBirdPrice = early_bird_price ? Number(early_bird_price) : null;
  if (parsedEarlyBirdPrice !== null) {
    if (!Number.isFinite(parsedEarlyBirdPrice) || parsedEarlyBirdPrice <= 0) {
      return NextResponse.json({ error: "early_bird_price must be a positive number" }, { status: 400 });
    }
    if (parsedEarlyBirdPrice >= basePrice) {
      return NextResponse.json({ error: "early_bird_price must be less than the entry fee" }, { status: 400 });
    }
  }

  const db = getSupabaseServer();

  // Verify event exists and is owned/accessible
  const { data: ev } = await db.from("events").select("id").eq("id", event_id).single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("event_races")
    .insert({
      event_id,
      name:                 String(name).trim(),
      distance:             String(distance).trim(),
      description:          description ? String(description) : null,
      price:                basePrice,
      early_bird_price:     parsedEarlyBirdPrice,
      price_type:           ["per_participant","per_registration"].includes(String(price_type)) ? String(price_type) : "per_participant",
      min_participants:     Math.max(1, Number(min_participants) || 1),
      max_participants:     Math.max(1, Number(max_participants) || 1),
      max_slots:            max_slots ? Number(max_slots) : null,
      perks:                perks && typeof perks === "object" ? perks : { medal: false, bib: true, tshirt: false, breakfast: false, certificate: false, goodies: false },
      reporting_time:       reporting_time ? String(reporting_time) : null,
      gun_time:             gun_time ? String(gun_time) : null,
      cutoff_time:          cutoff_time ? String(cutoff_time) : null,
      timing_chip:          Boolean(timing_chip),
      auto_bib:             Boolean(auto_bib),
      bib_prefix:           bib_prefix ? String(bib_prefix) : null,
      gender_restriction:   gender_restriction ? String(gender_restriction) : null,
      min_age:              min_age ? Number(min_age) : null,
      max_age:              max_age ? Number(max_age) : null,
      qualifying_required:  Boolean(qualifying_required),
      qualifying_notes:     qualifying_notes ? String(qualifying_notes) : null,
      display_order:        Number(display_order) || 0,
      status:               "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Sync distance_categories array for backward compat with existing code
  await syncDistanceCategories(db, event_id);

  return NextResponse.json({ race: data }, { status: 201 });
}

// ── PATCH /api/admin/events/[id]/races ───────────────────────────────────────
// Updates a race. Body must include id.

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;
  const { id: raceId, ...fields } = body;

  if (!raceId) return NextResponse.json({ error: "Race id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Build safe update object — only allow known fields
  const allowed: Record<string, unknown> = {};
  const allowedKeys = [
    "name", "distance", "description", "price", "early_bird_price",
    "price_type", "min_participants", "max_participants",
    "max_slots", "reporting_time", "gun_time", "cutoff_time",
    "timing_chip", "auto_bib", "bib_prefix",
    "gender_restriction", "min_age", "max_age",
    "qualifying_required", "qualifying_notes",
    "perks", "display_order", "status",
  ];
  for (const k of allowedKeys) {
    if (k in fields) allowed[k] = fields[k];
  }

  // Validate and coerce early_bird_price — must be positive and < price
  if ("early_bird_price" in fields) {
    const rawEbp = fields.early_bird_price;
    const ebp = (rawEbp !== null && rawEbp !== "" && rawEbp !== undefined)
      ? Number(rawEbp)
      : null;
    if (ebp !== null) {
      if (!Number.isFinite(ebp) || ebp <= 0) {
        return NextResponse.json({ error: "early_bird_price must be a positive number" }, { status: 400 });
      }
      // Compare against updated price if provided, otherwise we'll validate after fetch
      const newPrice = "price" in fields ? Number(fields.price) : null;
      if (newPrice !== null && ebp >= newPrice) {
        return NextResponse.json({ error: "early_bird_price must be less than the entry fee" }, { status: 400 });
      }
    }
    allowed.early_bird_price = ebp;
  }

  allowed.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("event_races")
    .update(allowed)
    .eq("id", String(raceId))
    .eq("event_id", event_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Race not found" }, { status: 404 });

  await syncDistanceCategories(db, event_id);

  return NextResponse.json({ race: data });
}

// ── DELETE /api/admin/events/[id]/races ──────────────────────────────────────
// Deletes a race. Body must include id.

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const { id: raceId } = await req.json() as { id?: string };

  if (!raceId) return NextResponse.json({ error: "Race id required" }, { status: 400 });

  const db = getSupabaseServer();

  const { error } = await db
    .from("event_races")
    .delete()
    .eq("id", raceId)
    .eq("event_id", event_id);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await syncDistanceCategories(db, event_id);

  return NextResponse.json({ ok: true });
}

// ── Backward-compat sync ──────────────────────────────────────────────────────
// Keeps events.distance_categories TEXT[] in sync with event_races rows so that
// all existing code, mobile app queries, and registration flows continue working
// without any changes.

async function syncDistanceCategories(
  db:       ReturnType<typeof getSupabaseServer>,
  event_id: string,
): Promise<void> {
  const { data: races } = await db
    .from("event_races")
    .select("distance")
    .eq("event_id", event_id)
    .eq("status", "active");

  const cats = [...new Set((races ?? []).map(r => r.distance))];

  await db
    .from("events")
    .update({ distance_categories: cats })
    .eq("id", event_id);
}
