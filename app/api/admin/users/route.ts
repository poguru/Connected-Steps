import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const [usersRes, membershipsRes, leaderboardRes, sessionsRes] = await Promise.all([
    db.from("users").select("email, first_name, last_name, phone, goal, location, created_at").order("created_at", { ascending: false }),
    db.from("memberships").select("user_email, plan, status, expires_at"),
    db.from("leaderboard").select("user_email, total_points, month_points, total_runs, total_km"),
    db.from("session_attendance").select("user_email, attended").eq("attended", true),
  ]);

  const now = new Date();
  const membershipMap  = Object.fromEntries((membershipsRes.data ?? []).map((m) => [m.user_email, m]));
  const leaderboardMap = Object.fromEntries((leaderboardRes.data ?? []).map((l) => [l.user_email, l]));

  // Count attended sessions per user
  const sessionCountMap: Record<string, number> = {};
  for (const s of sessionsRes.data ?? []) {
    sessionCountMap[s.user_email] = (sessionCountMap[s.user_email] ?? 0) + 1;
  }

  const users = (usersRes.data ?? []).map((u) => {
    const m          = membershipMap[u.email];
    const l          = leaderboardMap[u.email];
    const isActive   = !!(m?.status === "active" && new Date(m.expires_at) > now);
    return {
      email:         u.email,
      first_name:    u.first_name,
      last_name:     u.last_name,
      phone:         u.phone       ?? "",
      goal:          u.goal        ?? "",
      location:      u.location    ?? "",
      created_at:    u.created_at  ?? "",
      membership:    isActive ? (m?.plan ?? null) : null,
      expires_at:    m?.expires_at ?? null,
      isActiveMember:isActive,
      total_points:  l?.total_points ?? 0,
      month_points:  l?.month_points ?? 0,
      total_runs:    l?.total_runs   ?? 0,
      total_km:      l?.total_km     ?? 0,
      session_count: sessionCountMap[u.email] ?? 0,
    };
  });

  const stats = {
    total:         users.length,
    activeMembers: users.filter((u) => u.isActiveMember).length,
    withStrava:    (leaderboardRes.data ?? []).length,
    totalSessions: Object.values(sessionCountMap).reduce((s, n) => s + n, 0),
  };

  return NextResponse.json({ users, stats });
}
