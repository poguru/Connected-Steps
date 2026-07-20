import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function currentMonthIST(): string {
  return todayIST().slice(0, 7);
}

function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function mondayKey(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  const dow = d.getUTCDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() - daysBack);
  return m.toISOString().slice(0, 10);
}

function sundayOfWeek(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ── Shared audit logic ────────────────────────────────────────────────────────

async function runAudit(month: string) {
  const [year, mo] = month.split("-").map(Number);
  const rangeStart = `${month}-01`;
  const rangeEnd   = `${month}-${String(lastDay(year, mo)).padStart(2, "0")}`;
  const today      = todayIST();
  const capEnd     = rangeEnd < today ? rangeEnd : today;

  const db = getSupabaseServer();

  // ── 1. Sessions in the month (up to today) ──────────────────────────────
  const { data: sessions, error: sErr } = await db
    .from("sessions")
    .select("id, date, title")
    .gte("date", rangeStart)
    .lte("date", capEnd)
    .order("date");

  if (sErr) throw new Error(`Sessions query failed: ${sErr.message}`);
  if (!sessions?.length) {
    return {
      month,
      sessions_count: 0,
      users_affected: 0,
      attendance_records: 0,
      missing_attendance_ledger: 0,
      missing_weekly_bonus_ledger: 0,
      duplicate_attendance_rows: 0,
      leaderboard_drift: [],
      per_user: [],
    };
  }

  const sessionIds     = sessions.map(s => s.id);
  const sessionDateMap = new Map(sessions.map(s => [s.id, s.date as string]));

  // ── 2. All attended records ──────────────────────────────────────────────
  const { data: allAtt, error: aErr } = await db
    .from("session_attendance")
    .select("session_id, user_email, user_name, attended")
    .in("session_id", sessionIds)
    .eq("attended", true);

  if (aErr) throw new Error(`Attendance query failed: ${aErr.message}`);

  // ── 3. Group attendance by user ──────────────────────────────────────────
  const userAttMap = new Map<string, { session_id: string; date: string }[]>();
  const userNameMap = new Map<string, string>();
  for (const att of allAtt ?? []) {
    if (!userAttMap.has(att.user_email)) userAttMap.set(att.user_email, []);
    userAttMap.get(att.user_email)!.push({
      session_id: att.session_id,
      date:       sessionDateMap.get(att.session_id) ?? "",
    });
    if (!userNameMap.has(att.user_email)) {
      userNameMap.set(att.user_email, att.user_name ?? att.user_email.split("@")[0]);
    }
  }
  const emails = [...userAttMap.keys()];

  // ── 4. Existing attendance ledger rows ───────────────────────────────────
  const { data: attLedger } = await db
    .from("points_ledger")
    .select("id, user_email, session_id, category")
    .in("session_id", sessionIds)
    .eq("category", "attendance");

  // Map: "email::sessionId" → count (to detect duplicates)
  const attLedgerCount = new Map<string, number>();
  for (const row of attLedger ?? []) {
    const key = `${row.user_email}::${row.session_id}`;
    attLedgerCount.set(key, (attLedgerCount.get(key) ?? 0) + 1);
  }

  // ── 5. Compute weekly bonus expectations ─────────────────────────────────
  const userWeeks = new Map<string, Map<string, number>>(); // email → weekStart → count
  for (const [email, atts] of userAttMap) {
    const weeks = new Map<string, number>();
    for (const att of atts) {
      if (!att.date) continue;
      const wk = mondayKey(att.date);
      weeks.set(wk, (weeks.get(wk) ?? 0) + 1);
    }
    userWeeks.set(email, weeks);
  }

  // All unique week-starts that appear in this month's attendance
  const allWeekStarts = new Set<string>();
  for (const weeks of userWeeks.values()) {
    for (const wk of weeks.keys()) allWeekStarts.add(wk);
  }

  // ── 6. Existing weekly_bonus ledger rows ─────────────────────────────────
  const bonusLedgerCount = new Map<string, number>();
  let weekKeyColumnExists = true;
  try {
    const { data: bonusLedger, error: bErr } = await db
      .from("points_ledger")
      .select("id, user_email, week_key")
      .in("user_email", emails)
      .eq("category", "weekly_bonus")
      .in("week_key", allWeekStarts.size ? [...allWeekStarts] : ["__none__"]);

    if (bErr?.message?.includes("week_key")) {
      weekKeyColumnExists = false;
    } else {
      for (const row of bonusLedger ?? []) {
        const key = `${row.user_email}::${row.week_key}`;
        bonusLedgerCount.set(key, (bonusLedgerCount.get(key) ?? 0) + 1);
      }
    }
  } catch {
    weekKeyColumnExists = false;
  }

  // ── 7. Leaderboard snapshot ──────────────────────────────────────────────
  const { data: lbRows } = await db
    .from("leaderboard")
    .select("user_email, user_name, month_points, total_points, points_month")
    .in("user_email", emails);

  const lbMap = new Map((lbRows ?? []).map(r => [r.user_email, r]));

  // ── 8. Per-user summary ──────────────────────────────────────────────────
  const perUser: Record<string, unknown>[] = [];
  let missingAttLedger   = 0;
  let missingBonusLedger = 0;
  let dupAttRows         = 0;

  for (const email of emails) {
    const atts  = userAttMap.get(email) ?? [];
    const weeks = userWeeks.get(email) ?? new Map();
    const lb    = lbMap.get(email);

    const attCount     = atts.length;
    const expectedAtt  = attCount * 5;

    // Missing attendance ledger rows
    let missingAtt = 0;
    let dupAtt     = 0;
    for (const att of atts) {
      const key   = `${email}::${att.session_id}`;
      const count = attLedgerCount.get(key) ?? 0;
      if (count === 0) missingAtt++;
      if (count > 1)   dupAtt += count - 1;
    }
    missingAttLedger += missingAtt;
    dupAttRows       += dupAtt;

    // Weekly bonus expectations
    let expectedBonus  = 0;
    let missingBonus   = 0;
    const bonusWeeks: string[] = [];
    for (const [wk, cnt] of weeks) {
      if (cnt >= 4) {
        expectedBonus += 5;
        bonusWeeks.push(wk);
        if (weekKeyColumnExists) {
          const key   = `${email}::${wk}`;
          const bCnt  = bonusLedgerCount.get(key) ?? 0;
          if (bCnt === 0) missingBonus++;
        }
      }
    }
    missingBonusLedger += missingBonus;

    const expectedMonthPts = expectedAtt + expectedBonus;
    const currentMonthPts  = lb && lb.points_month === month ? (lb.month_points ?? 0) : 0;

    perUser.push({
      email,
      name:                   userNameMap.get(email) ?? email.split("@")[0],
      attendance_count:       attCount,
      expected_att_pts:       expectedAtt,
      expected_bonus_pts:     expectedBonus,
      bonus_weeks:            bonusWeeks,
      expected_month_pts:     expectedMonthPts,
      current_lb_month_pts:   currentMonthPts,
      lb_drift:               expectedMonthPts - currentMonthPts,
      missing_att_ledger:     missingAtt,
      missing_bonus_ledger:   missingBonus,
      dup_att_rows:           dupAtt,
    });
  }

  // Leaderboard drift: users where expected ≠ current leaderboard
  const leaderboardDrift = perUser.filter(u => (u.lb_drift as number) !== 0);

  return {
    month,
    week_key_column_exists: weekKeyColumnExists,
    sessions_count:           sessions.length,
    users_affected:           emails.length,
    attendance_records:       (allAtt ?? []).length,
    missing_attendance_ledger:   missingAttLedger,
    missing_weekly_bonus_ledger: missingBonusLedger,
    duplicate_attendance_rows:   dupAttRows,
    leaderboard_drift_count:     leaderboardDrift.length,
    per_user:                    perUser,
  };
}

// ── GET — audit only, no writes ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = new URL(req.url).searchParams.get("month") ?? currentMonthIST();

  try {
    const audit = await runAudit(month);
    return NextResponse.json({ audit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[points/recalculate GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — audit + fix ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let month = currentMonthIST();
  try {
    const body = await req.json() as { month?: string };
    if (body.month) month = body.month;
  } catch { /* body optional */ }

  const [year, mo] = month.split("-").map(Number);
  const rangeStart = `${month}-01`;
  const rangeEnd   = `${month}-${String(lastDay(year, mo)).padStart(2, "0")}`;
  const today      = todayIST();
  const capEnd     = rangeEnd < today ? rangeEnd : today;

  const db = getSupabaseServer();

  // ── Step 1: Run audit to find what's missing ──────────────────────────────
  const audit = await runAudit(month);

  // ── Step 2: Backfill missing attendance ledger rows ───────────────────────
  let attRowsAdded = 0;

  const { data: sessions } = await db
    .from("sessions")
    .select("id, date, title")
    .gte("date", rangeStart)
    .lte("date", capEnd)
    .order("date");

  const sessionIds     = (sessions ?? []).map(s => s.id);
  const sessionDateMap = new Map((sessions ?? []).map(s => [s.id, s.date as string]));

  const { data: allAtt } = await db
    .from("session_attendance")
    .select("session_id, user_email, attended")
    .in("session_id", sessionIds)
    .eq("attended", true);

  const { data: existingAtt } = await db
    .from("points_ledger")
    .select("user_email, session_id")
    .in("session_id", sessionIds)
    .eq("category", "attendance");

  const existingAttSet = new Set(
    (existingAtt ?? []).map(r => `${r.user_email}::${r.session_id}`)
  );

  const attToInsert = (allAtt ?? [])
    .filter(a => !existingAttSet.has(`${a.user_email}::${a.session_id}`))
    .map(a => ({
      user_email: a.user_email,
      session_id: a.session_id,
      points:     5,
      reason:     "Attendance (backfilled)",
      category:   "attendance",
      awarded_by: null as string | null,
    }));

  if (attToInsert.length > 0) {
    // Chunk inserts to avoid PostgREST 1000-row limit
    const CHUNK = 500;
    for (let i = 0; i < attToInsert.length; i += CHUNK) {
      const { error: insErr } = await db
        .from("points_ledger")
        .insert(attToInsert.slice(i, i + CHUNK));
      if (insErr) {
        console.error("[recalculate] attendance insert error", insErr.message);
      } else {
        attRowsAdded += Math.min(CHUNK, attToInsert.length - i);
      }
    }
  }

  // ── Step 3: Backfill missing weekly_bonus ledger rows ─────────────────────
  let bonusRowsAdded = 0;

  if (audit.week_key_column_exists) {
    // Re-derive user attendance map from fresh query
    const userAttMap = new Map<string, { session_id: string; date: string }[]>();
    for (const att of allAtt ?? []) {
      if (!userAttMap.has(att.user_email)) userAttMap.set(att.user_email, []);
      userAttMap.get(att.user_email)!.push({
        session_id: att.session_id,
        date:       sessionDateMap.get(att.session_id) ?? "",
      });
    }

    const emails       = [...userAttMap.keys()];
    const allWeekStarts = new Set<string>();
    const userWeekCounts = new Map<string, Map<string, { count: number; last_session: string }>>();

    for (const [email, atts] of userAttMap) {
      const weeks = new Map<string, { count: number; last_session: string }>();
      for (const att of atts) {
        if (!att.date) continue;
        const wk = mondayKey(att.date);
        allWeekStarts.add(wk);
        if (!weeks.has(wk)) weeks.set(wk, { count: 0, last_session: att.session_id });
        weeks.get(wk)!.count++;
        weeks.get(wk)!.last_session = att.session_id;
      }
      userWeekCounts.set(email, weeks);
    }

    // Fetch existing bonus rows
    const { data: existingBonus } = await db
      .from("points_ledger")
      .select("user_email, week_key")
      .in("user_email", emails)
      .eq("category", "weekly_bonus")
      .in("week_key", allWeekStarts.size ? [...allWeekStarts] : ["__none__"]);

    const existingBonusSet = new Set(
      (existingBonus ?? []).map(r => `${r.user_email}::${r.week_key}`)
    );

    const bonusToInsert: Record<string, unknown>[] = [];
    for (const [email, weeks] of userWeekCounts) {
      for (const [wk, { count, last_session }] of weeks) {
        if (count >= 4 && !existingBonusSet.has(`${email}::${wk}`)) {
          bonusToInsert.push({
            user_email: email,
            session_id: last_session,
            points:     5,
            reason:     `Weekly Attendance Bonus — week of ${wk} (backfilled)`,
            category:   "weekly_bonus",
            awarded_by: "system",
            week_key:   wk,
          });
        }
      }
    }

    if (bonusToInsert.length > 0) {
      const { error: bInsErr } = await db
        .from("points_ledger")
        .upsert(bonusToInsert, { onConflict: "user_email,week_key", ignoreDuplicates: true });
      if (bInsErr) {
        console.error("[recalculate] weekly_bonus insert error", bInsErr.message);
      } else {
        bonusRowsAdded = bonusToInsert.length;
      }
    }
  }

  // ── Step 4: Recalculate leaderboard ──────────────────────────────────────
  const lbResult = await recalculateMonth(month, { force: true });

  // ── Step 5: Return report ─────────────────────────────────────────────────
  return NextResponse.json({
    month,
    audit,
    actions: {
      attendance_ledger_rows_added:    attRowsAdded,
      weekly_bonus_ledger_rows_added:  bonusRowsAdded,
      leaderboard_users_updated:       lbResult.updated,
      leaderboard_message:             lbResult.message,
    },
    summary: {
      users_recalculated:       audit.users_affected,
      attendance_points_added:  attRowsAdded * 5,
      weekly_bonuses_added:     bonusRowsAdded,
      duplicates_removed:       0,
      leaderboard_updated:      lbResult.updated,
      inconsistencies:          audit.leaderboard_drift_count,
    },
  });
}
