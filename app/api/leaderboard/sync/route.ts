import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, isAdmin } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  // Require auth: either a user token (own data only) or an admin session
  const userToken  = req.headers.get("x-user-token");
  const tokenEmail = userToken ? verifyUserToken(userToken) : null;
  const adminOk    = !tokenEmail && isAdmin(req);

  if (!tokenEmail && !adminOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { user_email, user_name, location, goal, month_runs, month_km, month_time_secs, total_runs, total_km, total_time_secs, month_points, total_points, points_month } = body;

    if (!user_email) return NextResponse.json({ error: "Missing user_email" }, { status: 400 });

    // Non-admin users may only sync their own leaderboard row
    if (tokenEmail && tokenEmail.toLowerCase() !== (user_email as string).toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
