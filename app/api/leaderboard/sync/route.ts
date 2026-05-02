import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_email, user_name, location, goal, week_runs, week_km, week_time_secs, total_runs, total_km, total_time_secs, week_points, total_points } = body;

    if (!user_email) return NextResponse.json({ error: "Missing user_email" }, { status: 400 });

    const db = getSupabaseServer();
    const { error } = await db.from("leaderboard").upsert({
      user_email,
      user_name,
      location,
      goal,
      week_runs,
      week_km,
      week_time_secs,
      total_runs,
      total_km,
      total_time_secs,
      week_points,
      total_points,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_email" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
