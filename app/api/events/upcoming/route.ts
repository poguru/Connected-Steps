import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 60; // 1-minute cache so unpublished events disappear quickly

export async function GET() {
  const db = getSupabaseServer();

  // Use IST (UTC+5:30) for today's cutoff
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today  = istNow.toISOString().split("T")[0];

  const SELECT_WITH_COUNT    = "id, title, description, event_type, cover_image, start_date, start_time, end_date, end_time, location, organizer, max_participants, participant_count, registration_required, price, featured, share_slug, share_count";
  const SELECT_WITHOUT_COUNT = "id, title, description, event_type, cover_image, start_date, start_time, end_date, end_time, location, organizer, max_participants, registration_required, price, featured, share_slug, share_count";

  let { data, error } = await db
    .from("events")
    .select(SELECT_WITH_COUNT)
    .eq("status", "published")
    .gte("start_date", today)
    .order("featured", { ascending: false })
    .order("start_date", { ascending: true })
    .limit(4);

  // participant_count column added by migration 20260613000007 — fall back if not yet applied
  if (error?.message?.includes("participant_count")) {
    ({ data, error } = await db
      .from("events")
      .select(SELECT_WITHOUT_COUNT)
      .eq("status", "published")
      .gte("start_date", today)
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true })
      .limit(4));
    if (data) data.forEach((e: Record<string, unknown>) => { e.participant_count = 0; });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
