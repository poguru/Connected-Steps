import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseServer();

  const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = istNow.toISOString().split("T")[0];
  const nowTime = istNow.toTimeString().split(" ")[0].substring(0, 5); // "HH:MM"

  // Show events that haven't ended yet (in IST):
  //   1. end_date is a future date
  //   2. end_date is today but end_time hasn't passed
  //   3. end_date is today with no end_time (all-day / unknown end — keep showing)
  //   4. no end_date set — fall back to start_date >= today
  const { data, error } = await db
    .from("events")
    .select("id, title, description, event_type, cover_image, start_date, start_time, end_date, end_time, registration_closes_at, location, organizer, max_participants, participant_count, registration_required, price, featured, share_slug, share_count, distance_categories")
    .eq("status", "published")
    .or(
      `end_date.gt.${today},` +
      `and(end_date.eq.${today},end_time.gt.${nowTime}),` +
      `and(end_date.eq.${today},end_time.is.null),` +
      `and(end_date.is.null,start_date.gte.${today})`
    )
    .order("featured", { ascending: false })
    .order("start_date", { ascending: true })
    .limit(4);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
