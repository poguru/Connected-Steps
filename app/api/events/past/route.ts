import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/events/past — recently completed published events (last 30 days)
export async function GET() {
  const db = getSupabaseServer();

  const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = istNow.toISOString().split("T")[0];
  const nowTime = istNow.toTimeString().split(" ")[0].substring(0, 5);
  const cutoff  = new Date(istNow.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Completed = end_date in the past, OR end_date is today and end_time has passed
  const { data, error } = await db
    .from("events")
    .select("id, title, description, event_type, cover_image, start_date, start_time, end_date, end_time, registration_closes_at, location, organizer, price, share_slug, status")
    .eq("status", "published")
    .or(
      `end_date.lt.${today},` +
      `and(end_date.eq.${today},end_time.lte.${nowTime}),` +
      // Events with no end_date whose start_date was yesterday or earlier
      `and(end_date.is.null,start_date.lt.${today})`
    )
    .gte("start_date", cutoff)
    .order("start_date", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
