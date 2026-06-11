/**
 * Shared streak calculation engine.
 *
 * Three algorithms, each preserved exactly from its original consumer:
 *
 *   calcDateGapStreak      — cron/streak-at-risk (pure date array, 14-day gap)
 *   calcMissToleranceStreak — dashboard DashboardHero (≤1 consecutive miss)
 *   calcHardBreakStreak    — coach-ops athletes (attended=false breaks immediately)
 */

/** Days between consecutive attended sessions before the gap breaks a streak. */
export const SESSION_GAP_DAYS = 14;

/**
 * Counts the current streak from an array of attended session dates.
 *
 * Used by: cron/streak-at-risk
 *
 * Rules (preserved from original cron implementation):
 * - Dates must be sorted descending (newest first).
 * - A gap > maxGapDays between any two adjacent dates ends the streak.
 * - Returns 0 for an empty array.
 */
export function calcDateGapStreak(
  dates: Date[],
  maxGapDays: number = SESSION_GAP_DAYS
): number {
  if (dates.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const gapDays = (dates[i - 1].getTime() - dates[i].getTime()) / (1000 * 60 * 60 * 24);
    if (gapDays <= maxGapDays) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Counts the current streak from session attendance records.
 *
 * Used by: components/dashboard/DashboardHero
 *
 * Rules (preserved from original calcStreak in DashboardHero):
 * - Sorts records by date descending internally.
 * - One consecutive miss is tolerated; two consecutive misses end the streak.
 */
export function calcMissToleranceStreak(
  sessions: Array<{ attended: boolean; date: string }>
): number {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  let streak = 0, misses = 0;
  for (const r of sorted) {
    if (r.attended) { streak++; misses = 0; }
    else { misses++; if (misses >= 2) break; }
  }
  return streak;
}

/**
 * Counts the current streak from pre-sorted session records.
 *
 * Used by: app/api/admin/coach-ops/athletes
 *
 * Rules (preserved from original streak loop in athletes route):
 * - Sessions must be sorted descending (newest first) by the caller.
 * - attended === false ends the streak immediately.
 * - attended === undefined/null is skipped (no record = not a miss).
 */
export function calcHardBreakStreak(
  sessions: Array<{ attended: boolean | undefined | null }>
): number {
  let streak = 0;
  for (const s of sessions) {
    if (s.attended === true)        { streak++; }
    else if (s.attended === false)  { break; }
    // undefined / null → skip
  }
  return streak;
}
