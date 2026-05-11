import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db  = getSupabaseServer();
  const key = email.toLowerCase();

  const [sessionRes, leaderboardRes, membershipRes] = await Promise.all([
    db.from("session_attendance").select("attended").eq("user_email", key).eq("attended", true),
    db.from("leaderboard").select("month_points").eq("user_email", key).single(),
    db.from("memberships").select("status, expires_at").eq("user_email", key).single(),
  ]);

  // Leaderboard rank — count how many users have more month_points
  let leaderboardRank: number | null = null;
  if (leaderboardRes.data) {
    const { count } = await db
      .from("leaderboard")
      .select("*", { count: "exact", head: true })
      .gt("month_points", leaderboardRes.data.month_points);
    leaderboardRank = (count ?? 0) + 1;
  }

  const sessionCount   = sessionRes.data?.length ?? 0;
  const hasMembership  = !!(membershipRes.data?.status === "active" && new Date(membershipRes.data.expires_at) > new Date());

  return NextResponse.json({ sessionCount, leaderboardRank, hasMembership });
}
