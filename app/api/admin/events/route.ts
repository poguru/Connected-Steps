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
 * the same millisecond with identical titles â€” handled below by the DB
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
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Backward-compatible: no pagination params â†’ same { data } shape as before.
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
    title, short_description, description, event_type, event_category, cover_image, banner_image,
    start_date, start_time, end_date, end_time,
    registration_opens_at, registration_closes_at, early_bird_ends_at,
    location, meeting_point, maps_url,
    organizer, organizer_email, organizer_phone, support_email, website,
    max_participants, registration_required,
    waiting_list_enabled, require_login, approval_required, collect_tshirt,
    price, featured, terms_conditions, highlights, faqs, registration_config,
    distance_categories, refund_policy, cancellation_policy, visibility,
    gallery_images, whatsapp_community_url, status,
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
      short_description:      short_description || null,
      description:            description || null,
      event_type:             event_type || "running",
      event_category:         event_category || "community",
      cover_image:            cover_image || null,
      banner_image:           banner_image || null,
      start_date,
      start_time:             start_time || null,
      end_date:               end_date || null,
      end_time:               end_time || null,
      registration_opens_at:  registration_opens_at || null,
      registration_closes_at: registration_closes_at || null,
      early_bird_ends_at:     early_bird_ends_at || null,
      location:               location.trim(),
      meeting_point:          meeting_point || null,
      maps_url:               maps_url || null,
      organizer:              organizer || null,
      organizer_email:        organizer_email || null,
      organizer_phone:        organizer_phone || null,
      support_email:          support_email || null,
      website:                website || null,
      max_participants:       max_participants ? Number(max_participants) : null,
      registration_required:  registration_required !== false,
      waiting_list_enabled:   waiting_list_enabled === true,
      require_login:          require_login !== false,
      approval_required:      approval_required === true,
      collect_tshirt:         collect_tshirt === true,
      price:                  Number(price) || 0,
      featured:               featured === true,
      terms_conditions:       terms_conditions || null,
      highlights:             Array.isArray(highlights) ? highlights : [],
      faqs:                   Array.isArray(faqs) ? faqs : [],
      registration_config:    registration_config || null,
      distance_categories:    Array.isArray(distance_categories) ? distance_categories : [],
      refund_policy:          refund_policy || null,
      cancellation_policy:    cancellation_policy || null,
      visibility:             visibility || "public",
      gallery_images:         Array.isArray(gallery_images) ? gallery_images : [],
      whatsapp_community_url: whatsapp_community_url || null,
      status:                 status || "draft",
      share_slug:             slug,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ data });
}

// Columns this endpoint allows — status toggling from list/manage pages only.
// Full event editing goes through /api/admin/events/[id]/edit which has its own whitelist.
const PATCH_ALLOWED = new Set(["status", "featured", "visibility"]);

export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (PATCH_ALLOWED.has(key)) updates[key] = val;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getSupabaseServer();

  // Delete registrations first â€” event_registrations has ON DELETE RESTRICT so
  // Supabase would block the event delete if any registrations exist.
  // event_rsvp has ON DELETE CASCADE so it cleans itself up automatically.
  await db.from("event_registrations").delete().eq("event_id", id);

  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ success: true });
}
