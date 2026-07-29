import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/events/by-slug?slug=gandipet-cycling-ride
// Add ?preview=1 (admin only) to bypass the published status filter.
export async function GET(req: NextRequest) {
  const slug    = req.nextUrl.searchParams.get("slug") ?? "";
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  if (!slug) return NextResponse.json({ event: null }, { status: 200 });

  const db = getSupabaseServer();

  // Preview mode: admin can view any event regardless of status.
  const skipStatusFilter = preview && (await isAdminOrCoach(req));

  let q = db.from("events").select("*").eq("share_slug", slug);
  if (!skipStatusFilter) q = q.eq("status", "published");

  const { data } = await q.single();

  if (!data) return NextResponse.json({ event: null }, { status: 404 });

  // Increment view count (fire-and-forget)
  db.from("events").update({ view_count: (data.view_count ?? 0) + 1 }).eq("share_slug", slug).then(() => {});

  // Fetch active custom form fields and race categories in parallel
  const [{ data: formFields }, { data: races }] = await Promise.all([
    db
      .from("event_form_fields")
      .select("id, field_key, field_type, label, placeholder, help_text, required, options, display_order, conditions, default_value, max_length, validation_pattern, editable_after_reg, section, race_ids")
      .eq("event_id", data.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    db
      .from("event_races")
      .select("id, name, distance, price, early_bird_price, price_type, min_participants, max_participants, max_slots, slot_reserved, reporting_time, gun_time, timing_chip, perks, gender_restriction, min_age, max_age, display_order, status")
      .eq("event_id", data.id)
      .eq("status", "active")
      .order("display_order", { ascending: true }),
  ]);

  return NextResponse.json({ event: data, form_fields: formFields ?? [], races: races ?? [] });
}

// POST /api/events/by-slug?slug=... — increment share count
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json({ ok: false });

  const db = getSupabaseServer();
  const { data } = await db.from("events").select("share_count").eq("share_slug", slug).single();
  if (data) {
    await db.from("events").update({ share_count: (data.share_count ?? 0) + 1 }).eq("share_slug", slug);
  }
  return NextResponse.json({ ok: true });
}
