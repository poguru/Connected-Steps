import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 300; // 5-minute cache

export async function GET() {
  const db = getSupabaseServer();

  // Use IST (UTC+5:30) for today's cutoff
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today  = istNow.toISOString().split("T")[0];

  const { data, error } = await db
    .from("events")
    .select("id, title, description, event_type, cover_image, start_date, start_time, end_date, end_time, location, organizer, max_participants, registration_required, share_slug, share_count")
    .eq("status", "published")
    .gte("start_date", today)
    .order("start_date", { ascending: true })
    .limit(4);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
