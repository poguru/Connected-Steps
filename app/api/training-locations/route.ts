import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/training-locations â€” public list of active training locations
// Used by: session creation form, user profile, leaderboard filter
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("training_locations")
    .select("id, name, area, city, meeting_point, maps_url, latitude, longitude, max_capacity, display_order")
    .eq("status", "active")
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ locations: data ?? [] });
}
