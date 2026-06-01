import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_email, user_name, location, goal, month_runs, month_km, month_time_secs, total_runs, total_km, total_time_secs, month_points, total_points, points_month } = body;

    if (!user_email) return NextResponse.json({ error: "Missing user_email" }, { status: 400 });

    // Don't overwrite existing points with zeros (guards against empty Strava sync)
    if ((month_points ?? 0) === 0 && (total_points ?? 0) === 0) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const db = getSupabaseServer();
    const { error } = await db.from("leaderboard").upsert({
      user_email,
      user_name,
      location,
      goal,
      month_runs,
      month_km,
      month_time_secs,
      total_runs,
      total_km,
      total_time_secs,
      month_points,
      total_points,
      points_month,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_email" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
