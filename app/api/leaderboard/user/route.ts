import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// XP uses 25 pts/session for meaningful level progression (thresholds: 100→10,000).
// Leaderboard uses 5 pts/session for tight competitive ranking.
// XP_MULTIPLIER converts leaderboard points → XP.
const XP_MULTIPLIER = 5;

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("leaderboard")
    .select("month_points, total_points, points_month")
    .eq("user_email", email.toLowerCase())
    .single();

  if (!data) return NextResponse.json({ month_points: 0, total_points: 0, month_xp: 0, total_xp: 0 });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const month_points = (data.points_month === currentMonth) ? (data.month_points ?? 0) : 0;
  const total_points = data.total_points ?? 0;

  // XP = leaderboard points × multiplier (separated so levels feel meaningful)
  const month_xp = month_points * XP_MULTIPLIER;
  const total_xp = total_points * XP_MULTIPLIER;

  return NextResponse.json({ month_points, total_points, month_xp, total_xp });
}
