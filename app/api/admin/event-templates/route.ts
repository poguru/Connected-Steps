import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/event-templates
// Returns all saved event templates, newest first.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_templates")
    .select("id, name, event_category, event_type, races, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

// POST /api/admin/event-templates
// Body (option A — derive from existing event):
//   { name: string, event_id: string }
// Body (option B — pass fields directly):
//   { name: string, event_category?, event_type?, event_description?, ... races? }
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  let row: Record<string, unknown>;

  if (body.event_id && typeof body.event_id === "string") {
    // Derive template from an existing event + its races.
    const [evRes, racesRes] = await Promise.all([
      db.from("events")
        .select("event_category, event_type, description, organizer, organizer_email, organizer_phone, support_email, website, cover_image, max_participants, waiting_list_enabled, require_login, approval_required, collect_tshirt, refund_policy, cancellation_policy, visibility")
        .eq("id", body.event_id)
        .single(),
      db.from("event_races")
        .select("name, distance, price, max_slots, reporting_time, gun_time, timing_chip, auto_bib, gender_restriction, min_age, max_age, description, display_order")
        .eq("event_id", body.event_id)
        .order("display_order"),
    ]);

    if (evRes.error || !evRes.data) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    const ev = evRes.data;

    row = {
      name:                 body.name,
      event_category:       ev.event_category ?? "community",
      event_type:           ev.event_type ?? "running",
      event_description:    ev.description,
      organizer:            ev.organizer,
      organizer_email:      ev.organizer_email,
      organizer_phone:      ev.organizer_phone,
      support_email:        ev.support_email,
      website:              ev.website,
      cover_image:          ev.cover_image,
      max_participants:     ev.max_participants,
      waiting_list_enabled: ev.waiting_list_enabled ?? false,
      require_login:        ev.require_login ?? true,
      approval_required:    ev.approval_required ?? false,
      collect_tshirt:       ev.collect_tshirt ?? false,
      refund_policy:        ev.refund_policy,
      cancellation_policy:  ev.cancellation_policy,
      visibility:           ev.visibility ?? "public",
      // Store races in wizard RaceForm shape (all strings for direct form binding)
      races: (racesRes.data ?? []).map(r => ({
        name:               r.name ?? "",
        distance:           r.distance ?? "",
        price:              String(r.price ?? 0),
        max_slots:          r.max_slots != null ? String(r.max_slots) : "",
        reporting_time:     r.reporting_time ?? "",
        gun_time:           r.gun_time ?? "",
        timing_chip:        r.timing_chip ?? false,
        auto_bib:           r.auto_bib ?? false,
        gender_restriction: r.gender_restriction ?? "",
        min_age:            r.min_age != null ? String(r.min_age) : "",
        max_age:            r.max_age != null ? String(r.max_age) : "",
        description:        r.description ?? "",
      })),
    };
  } else {
    // Direct field submission (future use — wizard "Save as template" without event_id)
    row = {
      name:                 body.name,
      event_category:       body.event_category ?? "community",
      event_type:           body.event_type ?? "running",
      event_description:    body.event_description ?? null,
      organizer:            body.organizer ?? null,
      organizer_email:      body.organizer_email ?? null,
      organizer_phone:      body.organizer_phone ?? null,
      support_email:        body.support_email ?? null,
      website:              body.website ?? null,
      cover_image:          body.cover_image ?? null,
      max_participants:     body.max_participants ? Number(body.max_participants) : null,
      waiting_list_enabled: Boolean(body.waiting_list_enabled),
      require_login:        body.require_login !== false,
      approval_required:    Boolean(body.approval_required),
      collect_tshirt:       Boolean(body.collect_tshirt),
      refund_policy:        body.refund_policy ?? null,
      cancellation_policy:  body.cancellation_policy ?? null,
      visibility:           body.visibility ?? "public",
      races:                Array.isArray(body.races) ? body.races : [],
    };
  }

  const { data, error } = await db.from("event_templates").insert(row).select("id, name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}
