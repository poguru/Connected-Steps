import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = getSupabaseServer();
  const sp  = req.nextUrl.searchParams;
  const PAGE_SIZE = 200;
  const page      = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
  const search    = sp.get("q")?.trim().toLowerCase() ?? "";

  // Paginated user query — prevents loading entire user table at scale
  let userQuery = db
    .from("users")
    .select("email, first_name, last_name, phone, goal, location, created_at, is_active")
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (search) {
    userQuery = userQuery.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const [usersRes, membershipsRes, leaderboardRes, sessionsRes] = await Promise.all([
    userQuery,
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
      is_active:     u.is_active   ?? true,
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
    page,
    page_size: PAGE_SIZE,
    has_more:  users.length === PAGE_SIZE,
  };

  return NextResponse.json({ users, stats });
}

// PATCH /api/admin/users — { email, is_active: boolean }
// Deactivates or re-enables a user account.
export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, is_active } = await req.json().catch(() => ({})) as { email?: string; is_active?: boolean };
  if (!email || typeof is_active !== "boolean")
    return NextResponse.json({ error: "email and is_active (boolean) required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("users")
    .update({ is_active })
    .eq("email", email.toLowerCase().trim());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, email: email.toLowerCase().trim(), is_active });
}
