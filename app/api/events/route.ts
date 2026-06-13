import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 60;

// GET /api/events — all published future events for the listing page
export async function GET() {
  const db = getSupabaseServer();

  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today  = istNow.toISOString().split("T")[0];

  const { data, error } = await db
    .from("events")
    .select("id, title, description, event_type, cover_image, start_date, start_time, end_date, end_time, location, organizer, max_participants, participant_count, registration_required, price, featured, share_slug, view_count, share_count, status")
    .eq("status", "published")
    .gte("start_date", today)
    .order("featured", { ascending: false })
    .order("start_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
