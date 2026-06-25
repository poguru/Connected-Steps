import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { cacheGet, cacheSet, CK, TTL, type LbCacheRow, decorateLb } from "@/lib/cache";

export async function GET(req: NextRequest) {
  const db = getSupabaseServer();

  // Authenticated callers see full user_email; public/unauthenticated get null.
  // Prevents email harvesting while keeping the leaderboard publicly viewable.
  const callerEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");

  const sp         = new URL(req.url).searchParams;
  const friendsOf  = sp.get("friends_of");
  const locationId = sp.get("location_id");

  const cacheKey = CK.leaderboard(locationId, friendsOf);

  // ── Cache read ──────────────────────────────────────────────────────────────
  const cached = await cacheGet<LbCacheRow[]>(cacheKey);
  if (cached) {
    return NextResponse.json(
      { entries: decorateLb(cached, callerEmail), location_id: locationId ?? null },
      { headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          "X-Cache": "HIT",
        },
      },
    );
  }

  // ── Base leaderboard entries ──────────────────────────────────────────────
  let q = db
    .from("leaderboard")
    .select("id, user_email, user_name, location, goal, month_points, total_points, week_points, prev_month_rank, updated_at");

  if (friendsOf) {
    // Friends tab — get followed emails first
    const { data: follows } = await db
      .from("follows")
      .select("following_email")
      .eq("follower_email", friendsOf);
    const emails = (follows ?? []).map(f => f.following_email);
    if (!emails.length) return NextResponse.json({ entries: [] });
    q = q.in("user_email", emails);
  } else if (locationId) {
    // Training location tab — filter to users assigned to this location
    const { data: members } = await db
      .from("user_location_assignments")
      .select("user_email")
      .eq("location_id", locationId);
    const emails = (members ?? []).map(m => m.user_email);
    if (!emails.length) return NextResponse.json({ entries: [], location_id: locationId });
    q = q.in("user_email", emails);
  }

  const { data: entries, error } = await q.order("month_points", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entries?.length) return NextResponse.json({ entries: [] });

  // ── Compute week_points from session attendance (current ISO week) ─────────
  const weekStart = getISOWeekStart();
  const { data: weekAttendance } = await db
    .from("session_attendance")
    .select("user_email, bonus_points, sessions!inner(date)")
    .eq("attended", true)
    .gte("sessions.date", weekStart);

  const weekMap: Record<string, number> = {};
  for (const row of weekAttendance ?? []) {
    const pts = (row.bonus_points && row.bonus_points > 0) ? row.bonus_points : 5;
    weekMap[row.user_email] = (weekMap[row.user_email] ?? 0) + pts;
  }

  // ── Fetch user photos ─────────────────────────────────────────────────────
  const emails = entries.map(e => e.user_email);
  const { data: users } = await db
    .from("users")
    .select("email, photo")
    .in("email", emails);
  const photoMap: Record<string, string | null> = {};
  for (const u of users ?? []) photoMap[u.email] = u.photo ?? null;

  // ── Build cache rows (email stored as _raw_email, never sent to clients) ──
  const toCache: LbCacheRow[] = entries.map(e => ({
    id:              e.id,
    _raw_email:      e.user_email,
    user_name:       e.user_name,
    location:        e.location ?? null,
    goal:            e.goal ?? null,
    month_points:    e.month_points,
    total_points:    e.total_points,
    week_points:     weekMap[e.user_email] ?? (e.week_points ?? 0),
    prev_month_rank: e.prev_month_rank ?? null,
    updated_at:      e.updated_at ?? null,
    photo:           photoMap[e.user_email] ?? null,
  }));

  // Store in cache (fire-and-forget — never blocks the response)
  void cacheSet(cacheKey, toCache, TTL.leaderboard);

  return NextResponse.json(
    { entries: decorateLb(toCache, callerEmail), location_id: locationId ?? null },
    { headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": "MISS",
      },
    },
  );
}

function getISOWeekStart(): string {
  const now  = new Date();
  const day  = now.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}
