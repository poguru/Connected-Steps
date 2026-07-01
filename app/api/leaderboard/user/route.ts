import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

const XP_MULTIPLIER = 5;

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("leaderboard")
    .select("month_points, total_points, points_month, rank")
    .eq("user_email", userEmail.toLowerCase())
    .single();

  if (!data) return NextResponse.json({ month_points: 0, total_points: 0, month_xp: 0, total_xp: 0, rank: null });

  // Use IST (UTC+05:30) so the month boundary matches the IST calendar day,
  // not the UTC clock — avoids showing June data on 1 July IST until 5h30m UTC.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const currentMonth  = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 7);
  const month_points = data.points_month === currentMonth ? (data.month_points ?? 0) : 0;
  const total_points = data.total_points ?? 0;

  return NextResponse.json({
    month_points,
    total_points,
    month_xp: month_points * XP_MULTIPLIER,
    total_xp: total_points * XP_MULTIPLIER,
    rank:     data.rank ?? null,
  });
}
