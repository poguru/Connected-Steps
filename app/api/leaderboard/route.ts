import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { cacheGet, cacheSet, CK, TTL, type LbCacheRow, decorateLb } from "@/lib/cache";
import { getISTNow } from "@/lib/date-utils";

/** Current calendar month in IST as "YYYY-MM". */
export function currentMonthIST(): string {
  return getISTNow().toISOString().slice(0, 7);
}

/**
 * ISO week Monday in IST as "YYYY-MM-DD".
 * Week starts on Monday per ISO 8601.
 */
export function isoWeekStartIST(): string {
  const ist  = getISTNow();
  const day  = ist.getUTCDay();          // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // days back to Monday
  const mon  = new Date(ist.getTime() + diff * 24 * 60 * 60 * 1000);
  return mon.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const db = getSupabaseServer();

  // Authenticated callers see full user_email; public/unauthenticated get null.
  // Prevents email harvesting while keeping the leaderboard publicly viewable.
  const callerEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");

  const sp         = new URL(req.url).searchParams;
  const friendsOf  = sp.get("friends_of");
  const locationId = sp.get("location_id");

  const cacheKey = CK.leaderboard(locationId, friendsOf);

  // â"€â"€ Cache read â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const cached = await cacheGet<LbCacheRow[]>(cacheKey);
  if (cached) {
    return NextResponse.json(
      { entries: decorateLb(cached, callerEmail), location_id: locationId ?? null },
      { headers: {
          "Cache-Control": "no-store",
          "X-Cache": "HIT",
        },
      },
    );
  }

  // â"€â"€ Base leaderboard entries â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // IMPORTANT: also select `points_month` so we can validate whether the
  // cached `month_points` value belongs to the current calendar month (IST).
  let q = db
    .from("leaderboard")
    .select("id, user_email, user_name, location, goal, month_points, points_month, total_points, week_points, prev_month_rank, updated_at");

  if (friendsOf) {
    // Friends tab â€" get followed emails first
    const { data: follows } = await db
      .from("follows")
      .select("following_email")
      .eq("follower_email", friendsOf);
    const emails = (follows ?? []).map(f => f.following_email);
    if (!emails.length) return NextResponse.json({ entries: [] });
    q = q.in("user_email", emails);
  } else if (locationId) {
    // Training location tab â€" filter to users assigned to this location
    const { data: members } = await db
      .from("user_location_assignments")
      .select("user_email")
      .eq("location_id", locationId);
    const emails = (members ?? []).map(m => m.user_email);
    if (!emails.length) return NextResponse.json({ entries: [], location_id: locationId });
    q = q.in("user_email", emails);
  }

  const { data: entries, error } = await q.order("month_points", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!entries?.length) return NextResponse.json({ entries: [] });

  // â"€â"€ Determine current IST calendar month â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // `month_points` in the leaderboard table is a cached value from the last
  // recalculation. `points_month` records which YYYY-MM that calculation was
  // for. If `points_month` does not match today's IST month the cached value
  // is stale (e.g. June data shown on 1 July) and must be treated as 0.
  const curMonth = currentMonthIST();

  // â"€â"€ Compute week_points from session attendance (current IST ISO week) â"€â"€â"€â"€â"€
  // Always recomputed live (not read from the cached leaderboard column) to
  // guarantee correctness across week boundaries without waiting for a sync.
  const weekStart = isoWeekStartIST();
  const { data: weekAttendance } = await db
    .from("session_attendance")
    .select("user_email, bonus_points, sessions!inner(date)")
    .eq("attended", true)
    .gte("sessions.date", weekStart);

  const weekMap: Record<string, number> = {};
  for (const row of weekAttendance ?? []) {
    // Scoring rule must match recalculate-leaderboard.ts exactly:
    //   5 base points + bonus_points (extra points on top of base).
    // Previous formula `bonus_points > 0 ? bonus_points : 5` was wrong:
    // it treated bonus_points as a *replacement* for the 5-pt base rather
    // than an *addition*, causing week_points to be inconsistent with
    // month_points when bonus points were set.
    const pts = 5 + (row.bonus_points ?? 0);
    weekMap[row.user_email] = (weekMap[row.user_email] ?? 0) + pts;
  }

  // â"€â"€ Fetch user photos â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const emails = entries.map(e => e.user_email);
  const { data: users } = await db
    .from("users")
    .select("email, photo")
    .in("email", emails);
  const photoMap: Record<string, string | null> = {};
  for (const u of users ?? []) photoMap[u.email] = u.photo ?? null;

  // â"€â"€ Build cache rows (email stored as _raw_email, never sent to clients) â"€â"€
  const toCache: LbCacheRow[] = entries.map(e => ({
    id:              e.id,
    _raw_email:      e.user_email,
    user_name:       e.user_name,
    location:        e.location ?? null,
    goal:            e.goal ?? null,
    // Gate month_points on points_month matching the current IST calendar month.
    // If the last recalculation was for a previous month (e.g. June) and no
    // July sessions have been synced yet, month_points must be 0 â€" not the
    // stale June value stored in the table.
    month_points:    e.points_month === curMonth ? (e.month_points ?? 0) : 0,
    total_points:    e.total_points,
    week_points:     weekMap[e.user_email] ?? (e.week_points ?? 0),
    prev_month_rank: e.prev_month_rank ?? null,
    updated_at:      e.updated_at ?? null,
    photo:           photoMap[e.user_email] ?? null,
  }));

  // Store in cache (fire-and-forget â€" never blocks the response)
  void cacheSet(cacheKey, toCache, TTL.leaderboard);

  return NextResponse.json(
    { entries: decorateLb(toCache, callerEmail), location_id: locationId ?? null },
    { headers: {
        "Cache-Control": "no-store",
        "X-Cache": "MISS",
      },
    },
  );
}
