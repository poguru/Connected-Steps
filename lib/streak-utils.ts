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
 * Fix (2026-06-25): Original algorithm incorrectly broke the streak when
 * two consecutive *unattended* registrations (attended=false) appeared at the
 * top of the list — e.g. a user pre-registered for tomorrow's session and today's
 * session but neither has been checked-in yet → streak = 0 despite 7 attended.
 *
 * Correct rules:
 * - Only attended=true sessions count toward the streak.
 * - Sessions are evaluated by date-gap: a gap > 14 days between any two
 *   consecutive attended sessions ends the streak.
 * - If the most recent attended session was > 14 days ago, streak = 0.
 */
export function calcMissToleranceStreak(
  sessions: Array<{ attended: boolean; date: string }>
): number {
  // Only use attended sessions — unattended registrations are irrelevant to streak
  const attendedDates = sessions
    .filter(s => s.attended)
    .map(s => new Date(s.date + "T12:00:00Z").getTime())
    .sort((a, b) => b - a); // most recent first

  if (attendedDates.length === 0) return 0;

  // Must have attended within the last 14 days for streak to be active
  const daysSinceLast = (Date.now() - attendedDates[0]) / 86_400_000;
  if (daysSinceLast > SESSION_GAP_DAYS) return 0;

  // Count backwards: streak ends when gap between consecutive sessions > 14 days
  let streak = 1;
  for (let i = 1; i < attendedDates.length; i++) {
    const gapDays = (attendedDates[i - 1] - attendedDates[i]) / 86_400_000;
    if (gapDays <= SESSION_GAP_DAYS) streak++;
    else break;
  }
  return streak;
}

/**
 * Returns the all-time best streak from a full attendance history.
 * Uses the same gap-based algorithm as calcMissToleranceStreak.
 */
export function calcBestStreak(
  sessions: Array<{ attended: boolean; date: string }>
): number {
  const attendedDates = sessions
    .filter(s => s.attended)
    .map(s => new Date(s.date + "T12:00:00Z").getTime())
    .sort((a, b) => b - a); // most recent first

  if (attendedDates.length === 0) return 0;

  let best = 1, current = 1;
  for (let i = 1; i < attendedDates.length; i++) {
    const gapDays = (attendedDates[i - 1] - attendedDates[i]) / 86_400_000;
    if (gapDays <= SESSION_GAP_DAYS) {
      current++;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }
  return best;
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
