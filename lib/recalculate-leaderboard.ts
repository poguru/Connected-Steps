import { getSupabaseServer } from "@/lib/supabase-server";
import { cacheDel, CK } from "@/lib/cache";

function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Current calendar date in IST (UTC+05:30) as "YYYY-MM-DD".
 *
 * Sessions are stored with IST-local dates (e.g. "2025-07-01").
 * Using UTC for `today` would cause a ~5h30m window at the start of each
 * IST day where `today` (UTC) is still the previous date, causing the
 * upper-bound session filter to exclude same-day IST sessions.
 */
function todayIST(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function mondayKey(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  const dow = d.getUTCDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysBack);
  return monday.toISOString().slice(0, 10);
}

export async function recalculateMonth(month: string): Promise<{ message: string; updated: number }> {
  const [year, mo] = month.split("-").map(Number);
  const rangeStart = `${month}-01`;
  const rangeEnd   = `${month}-${String(lastDay(year, mo)).padStart(2, "0")}T23:59:59Z`;

  const db = getSupabaseServer();

  // Debounce: if any leaderboard row for this month was updated in the last 60s,
  // a concurrent recalculation is already in progress or just completed — skip.
  // Prevents 100 simultaneous QR scans from spawning 100 full recalculations.
  const { data: recent } = await db
    .from("leaderboard")
    .select("updated_at")
    .eq("points_month", month)
    .gte("updated_at", new Date(Date.now() - 60_000).toISOString())
    .limit(1);
  if (recent?.length) {
    return { message: "Skipped — recalculated within last 60s", updated: 0 };
  }

  const today = todayIST();

  const { data: sessions, error: sErr } = await db
    .from("sessions")
    .select("id, date, location")
    .gte("date", rangeStart)
    .lte("date", rangeEnd < today ? rangeEnd : today)
    .order("date");

  if (sErr) throw new Error(sErr.message);
  if (!sessions?.length) return { message: "No sessions in this month.", updated: 0 };

  const sessionIds = sessions.map((s) => s.id);

  const { data: allAtt, error: aErr } = await db
    .from("session_attendance")
    .select("id, session_id, user_email, attended, bonus_points")
    .in("session_id", sessionIds);

  if (aErr) throw new Error(aErr.message);
  if (!allAtt?.length) return { message: "No attendance records found.", updated: 0 };

  const emails = [...new Set(allAtt.map((a) => a.user_email))];

  const { data: users, error: uErr } = await db
    .from("users")
    .select("email, first_name, last_name, location, goal")
    .in("email", emails);
  if (uErr) throw new Error(uErr.message);

  // Case-insensitive dedup: index by lowercase email so we can look up either case.
  const userMap = new Map((users ?? []).map((u) => [u.email.toLowerCase(), u]));

  // Fetch all existing leaderboard fields so we can preserve run/km data on upsert.
  // Also fetch location, goal, and user_name so users absent from the `users` table
  // retain their display data from the previous leaderboard row.
  const { data: existing } = await db
    .from("leaderboard")
    .select("user_email, user_name, location, goal, month_points, total_points, points_month, month_runs, month_km, month_time_secs, total_runs, total_km, total_time_secs")
    .in("user_email", emails);
  const lbMap = new Map((existing ?? []).map((e) => [e.user_email.toLowerCase(), e]));

  const sessionDateMap = new Map(sessions.map((s) => [s.id, s.date]));

  const userAttMap  = new Map<string, { session_id: string; attended: boolean; bonus_points: number }[]>();
  const allAttIds:  number[] = [];

  for (const att of allAtt) {
    if (!userAttMap.has(att.user_email)) {
      userAttMap.set(att.user_email, []);
    }
    userAttMap.get(att.user_email)!.push({
      session_id:   att.session_id,
      attended:     att.attended,
      bonus_points: att.bonus_points ?? 0,
    });
    allAttIds.push(att.id);
  }

  // ── Build all leaderboard rows in memory ──────────────────────────────────
  // Scoring rules are unchanged:
  //   Base:          5 pts per attended session + manual bonus_points
  //   Weekly bonus:  +5 if user attended 4+ sessions in any calendar week
  //   Total:         preserved across months (old_total - old_month + new_month)

  const upsertRows: Record<string, unknown>[] = [];

  for (const email of emails) {
    // Look up the user profile case-insensitively.
    const user = userMap.get(email.toLowerCase());
    // Look up existing leaderboard row (case-insensitive) to preserve run/km data
    // and carry the display name when the user has no users-table row.
    const lb   = lbMap.get(email.toLowerCase());

    // Build display name: prefer users table → existing LB row → email prefix.
    // We do NOT skip users who are absent from the users table; they still earned
    // attendance points and must appear on the leaderboard.
    const displayName = user
      ? `${user.first_name} ${user.last_name}`.trim()
      : (lb?.user_name ?? email.split("@")[0]);

    const location = user?.location ?? lb?.location ?? "";
    const goal     = user?.goal     ?? lb?.goal     ?? "";

    const userAtt = userAttMap.get(email) ?? [];

    let basePoints = 0;
    for (const att of userAtt) {
      if (att.attended) basePoints += 5 + (att.bonus_points ?? 0);
    }

    const weekAttCount = new Map<string, number>();
    for (const att of userAtt) {
      if (!att.attended) continue;
      const date = sessionDateMap.get(att.session_id);
      if (!date) continue;
      const wk = mondayKey(date);
      weekAttCount.set(wk, (weekAttCount.get(wk) ?? 0) + 1);
    }
    let weeklyBonus = 0;
    for (const count of weekAttCount.values()) {
      if (count >= 4) weeklyBonus += 5;
    }

    const newMonthPts = basePoints + weeklyBonus;
    const oldMonthPts = lb && lb.points_month === month ? (lb.month_points ?? 0) : 0;
    const oldTotal    = lb?.total_points ?? 0;
    const newTotal    = Math.max(0, oldTotal - oldMonthPts + newMonthPts);

    upsertRows.push({
      user_email:      email,
      user_name:       displayName,
      location,
      goal,
      month_points:    newMonthPts,
      total_points:    newTotal,
      points_month:    month,
      // Preserve existing run/km data — only a separate Strava sync touches these
      month_runs:      lb?.month_runs      ?? 0,
      month_km:        lb?.month_km        ?? 0,
      month_time_secs: lb?.month_time_secs ?? 0,
      total_runs:      lb?.total_runs      ?? 0,
      total_km:        lb?.total_km        ?? 0,
      total_time_secs: lb?.total_time_secs ?? 0,
      updated_at:      new Date().toISOString(),
    });
  }

  if (upsertRows.length === 0) return { message: "No users to update.", updated: 0 };

  // ── Chunked upsert — Supabase PostgREST rejects single batches > 1,000 rows ──
  // Chunks of 500 are safe, keep each round-trip well below the limit.
  // "Last writer wins" remains safe — concurrent calls produce identical scores.
  const CHUNK = 500;
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const chunk = upsertRows.slice(i, i + CHUNK);
    const { error: upsertErr } = await db
      .from("leaderboard")
      .upsert(chunk, { onConflict: "user_email" });
    if (upsertErr) throw new Error(`Chunk ${i}–${i + CHUNK}: ${upsertErr.message}`);
  }

  // ── Single batch mark all month attendance as synced ─────────────────────
  // Covers all sessions in the month, not just the one that triggered the sync.
  if (allAttIds.length > 0) {
    await db
      .from("session_attendance")
      .update({ points_synced: true })
      .in("id", allAttIds);
  }

  // ── Invalidate public leaderboard cache ───────────────────────────────────
  // The public /api/leaderboard route stores its response in Redis (30s TTL)
  // and behind HTTP CDN (stale-while-revalidate 60s).  Without explicit
  // invalidation users would see a stale snapshot for up to ~90 s after sync.
  // We delete the base cache key (no-location, no-friends) which is the most
  // frequently served variant.  Location-specific and friends-scoped keys carry
  // their own 30s TTL and will self-expire; explicit deletion is not needed for
  // correctness (just convenience for admin-facing tools).
  await cacheDel(CK.leaderboard(null, null));

  return { message: `Recalculated points for ${upsertRows.length} user(s) — ${month}.`, updated: upsertRows.length };
}
