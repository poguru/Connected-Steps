import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Generate a unique share slug without any DB round-trips.
 *
 * Previously: a while-loop queried the DB up to 10 times per event creation
 * to find an unused slug (worst case ~30 ms + 10 sequential reads).
 *
 * Now: append a base-36 timestamp suffix that is effectively unique at human
 * event-creation rates.  Collisions would require two events created within
 * the same millisecond with identical titles — handled below by the DB
 * UNIQUE constraint if idx_events_share_slug is enforced.
 */
function uniqueSlug(base: string): string {
  return `${base}-${Date.now().toString(36)}`;
}

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();

  const sp    = req.nextUrl.searchParams;
  const limit = Math.max(0, parseInt(sp.get("limit") ?? "0", 10));
  const page  = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));

  let q = db.from("events").select("*").order("created_at", { ascending: false });
  if (limit > 0) q = q.range(page * limit, page * limit + limit - 1);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Backward-compatible: no pagination params → same { data } shape as before.
  // With params: adds page/limit/hasMore for client-side pagination UI.
  return NextResponse.json(
    limit > 0
      ? { data, page, limit, hasMore: (data?.length ?? 0) >= limit }
      : { data }
  );
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    title, description, event_type, cover_image,
    start_date, start_time, end_date, end_time,
    registration_closes_at,
    location, organizer, max_participants,
    registration_required,
    price, featured, terms_conditions, maps_url,
    distance_categories,
  } = body;

  if (!title || !location || !start_date) {
    return NextResponse.json({ error: "Title, location, and start date are required." }, { status: 400 });
  }

  const db   = getSupabaseServer();
  const slug = uniqueSlug(toSlug(title));

  const { data, error } = await db
    .from("events")
    .insert({
      title:                  title.trim(),
      description:            description || null,
      event_type:             event_type || "running",
      cover_image:            cover_image || null,
      start_date,
      start_time:             start_time || null,
      end_date:               end_date || null,
      end_time:               end_time || null,
      registration_closes_at: registration_closes_at || null,
      location:               location.trim(),
      organizer:              organizer || null,
      max_participants:       max_participants ? Number(max_participants) : null,
      registration_required:  registration_required !== false,
      price:                  Number(price) || 0,
      featured:               featured === true,
      terms_conditions:       terms_conditions || null,
      maps_url:               maps_url || null,
      distance_categories:    Array.isArray(distance_categories) ? distance_categories : [],
      status:                 "draft",
      share_slug:             slug,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("events")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getSupabaseServer();

  // Delete registrations first — event_registrations has ON DELETE RESTRICT so
  // Supabase would block the event delete if any registrations exist.
  // event_rsvp has ON DELETE CASCADE so it cleans itself up automatically.
  await db.from("event_registrations").delete().eq("event_id", id);

  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
