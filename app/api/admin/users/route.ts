import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

import { APP_URL } from "@/lib/config";
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = getSupabaseServer();
  const sp  = req.nextUrl.searchParams;
  const PAGE_SIZE = 200;
  const page      = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
  const search    = sp.get("q")?.trim().toLowerCase() ?? "";

  // Paginated user query â€” prevents loading entire user table at scale
  let userQuery = db
    .from("users")
    .select("email, first_name, last_name, phone, goal, location, created_at, is_active, phone_verified, phone_verified_at")
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
      email:              u.email,
      first_name:         u.first_name,
      last_name:          u.last_name,
      phone:              u.phone           ?? "",
      goal:               u.goal            ?? "",
      location:           u.location        ?? "",
      created_at:         u.created_at      ?? "",
      is_active:          u.is_active       ?? true,
      phone_verified:     u.phone_verified  ?? false,
      phone_verified_at:  u.phone_verified_at ?? null,
      membership:         isActive ? (m?.plan ?? null) : null,
      expires_at:         m?.expires_at ?? null,
      isActiveMember:     isActive,
      total_points:       l?.total_points ?? 0,
      month_points:       l?.month_points ?? 0,
      total_runs:         l?.total_runs   ?? 0,
      total_km:           l?.total_km     ?? 0,
      session_count:      sessionCountMap[u.email] ?? 0,
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

// PATCH /api/admin/users â€” { email, is_active: boolean }
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

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ success: true, email: email.toLowerCase().trim(), is_active });
}

// PUT /api/admin/users â€” { email, action: "verify_phone" | "resend_otp" }
// Admin phone verification management actions.
export async function PUT(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, action } = await req.json().catch(() => ({})) as { email?: string; action?: string };
  if (!email || !action) {
    return NextResponse.json({ error: "email and action required" }, { status: 400 });
  }

  const db      = getSupabaseServer();
  const cleaned = (email as string).toLowerCase().trim();

  if (action === "verify_phone") {
    // Manually mark phone as verified (admin override â€” no OTP required)
    const { error } = await db
      .from("users")
      .update({
        phone_verified:    true,
        phone_verified_at: new Date().toISOString(),
      })
      .eq("email", cleaned);

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    console.log(`[admin] manual phone verify for ${cleaned}`);
    return NextResponse.json({ success: true, action: "verify_phone", email: cleaned });
  }

  if (action === "resend_otp") {
    // Look up user's phone, then call send-phone-otp logic
    const { data: user } = await db
      .from("users")
      .select("phone")
      .eq("email", cleaned)
      .maybeSingle();

    if (!user?.phone) {
      return NextResponse.json({ error: "User has no phone number on file." }, { status: 400 });
    }

    // Delegate to the send-phone-otp endpoint via internal fetch
    const base = APP_URL;
    const res  = await fetch(`${base}/api/auth/send-phone-otp`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phone: user.phone, purpose: "verify_phone" }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    if (!res.ok) return NextResponse.json({ error: data.error ?? "OTP send failed." }, { status: res.status });

    console.log(`[admin] OTP resent for ${cleaned} â†’ ${user.phone}`);
    return NextResponse.json({ success: true, action: "resend_otp", email: cleaned });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
