import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

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

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function sundayOf(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(mondayStr: string): string {
  const sun = sundayOf(mondayStr);
  const fmt = (s: string) =>
    new Date(s + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${fmt(mondayStr)} – ${fmt(sun)}`;
}

// ── GET /api/admin/points/weekly-bonus-audit ──────────────────────────────────
// Read-only. Returns per-week, per-user breakdown of weekly bonus eligibility
// and whether the bonus was actually recorded in the points_ledger.
// NOTE: "eligible" is determined the same way recalculateMonth does it —
//       sessions within the requested month only, grouped by ISO week.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url   = new URL(req.url);
  const month = url.searchParams.get("month") ?? currentMonthIST();

  const [year, mo] = month.split("-").map(Number);
  const rangeStart = `${month}-01`;
  const rangeEnd   = `${month}-${String(lastDay(year, mo)).padStart(2, "0")}`;
  const today      = todayIST();
  const capEnd     = rangeEnd < today ? rangeEnd : today;

  const db = getSupabaseServer();

  // ── 1. Sessions in the month ──────────────────────────────────────────────
  const { data: sessions, error: sErr } = await db
    .from("sessions")
    .select("id, date, title, location")
    .gte("date", rangeStart)
    .lte("date", capEnd)
    .order("date");

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!sessions?.length) {
    return NextResponse.json({ month, weeks: [], summary: { total_users_eligible: 0, total_bonuses_expected: 0, total_bonuses_awarded: 0, discrepancies: 0 }, discrepancies: [], note: "No sessions found in this month." });
  }

  const sessionIds      = sessions.map(s => s.id);
  const sessionDateMap  = new Map(sessions.map(s => [s.id, s.date  as string]));
  const sessionTitleMap = new Map(sessions.map(s => [s.id, s.title as string]));

  // ── 2. All attended records ───────────────────────────────────────────────
  const { data: allAtt, error: aErr } = await db
    .from("session_attendance")
    .select("session_id, user_email, attended")
    .in("session_id", sessionIds)
    .eq("attended", true);

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  // ── 3. User display names ─────────────────────────────────────────────────
  const emails = [...new Set((allAtt ?? []).map(a => a.user_email))];
  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name")
    .in("email", emails);

  const nameMap = new Map<string, string>();
  for (const u of users ?? []) {
    nameMap.set(u.email.toLowerCase(), `${u.first_name} ${u.last_name}`.trim());
  }

  // ── 4. Existing weekly_bonus ledger rows ─────────────────────────────────
  // Collect all ISO week-starts that appear in this month's attendance
  const allWeekStarts = new Set<string>();
  for (const att of allAtt ?? []) {
    const d = sessionDateMap.get(att.session_id);
    if (d) allWeekStarts.add(mondayOf(d));
  }

  let bonusLedgerSet = new Set<string>(); // "email::weekStart"
  let weekKeyExists  = true;

  try {
    const { data: bonusRows, error: bErr } = await db
      .from("points_ledger")
      .select("user_email, week_key, created_at")
      .in("user_email", emails)
      .eq("category", "weekly_bonus")
      .in("week_key", allWeekStarts.size ? [...allWeekStarts] : ["__none__"]);

    if (bErr?.message?.toLowerCase().includes("week_key") || bErr?.code === "42703") {
      weekKeyExists = false;
    } else {
      for (const r of bonusRows ?? []) {
        bonusLedgerSet.add(`${r.user_email}::${r.week_key}`);
      }
    }
  } catch {
    weekKeyExists = false;
  }

  // ── 5. Build per-user, per-week attendance map ────────────────────────────
  // weekStart → email → [{ session_id, date, title }]
  const weekUserMap = new Map<string, Map<string, { session_id: string; date: string; title: string }[]>>();

  for (const att of allAtt ?? []) {
    const date = sessionDateMap.get(att.session_id);
    if (!date) continue;
    const wk = mondayOf(date);

    if (!weekUserMap.has(wk)) weekUserMap.set(wk, new Map());
    const userMap = weekUserMap.get(wk)!;
    if (!userMap.has(att.user_email)) userMap.set(att.user_email, []);
    userMap.get(att.user_email)!.push({
      session_id: att.session_id,
      date,
      title: sessionTitleMap.get(att.session_id) ?? att.session_id,
    });
  }

  // ── 6. Build report ───────────────────────────────────────────────────────
  const weeks: Record<string, unknown>[] = [];
  let totalEligibleUsers  = 0;
  let totalBonusExpected  = 0;
  let totalBonusAwarded   = 0;
  const discrepancies: Record<string, unknown>[] = [];

  const sortedWeeks = [...weekUserMap.keys()].sort();

  for (const wk of sortedWeeks) {
    const userMap    = weekUserMap.get(wk)!;
    const weekEnd    = sundayOf(wk);
    const weekLabel  = fmtWeekLabel(wk);
    const usersInWeek: Record<string, unknown>[] = [];

    // All users who attended at least one session in this week (in-month sessions only)
    const allUsersThisWeek = [...userMap.keys()].sort();

    for (const email of allUsersThisWeek) {
      const sessions = userMap.get(email)!.sort((a, b) => a.date.localeCompare(b.date));
      const name         = nameMap.get(email.toLowerCase()) ?? email.split("@")[0];
      const sessionCount = sessions.length;
      const attPts       = sessionCount * 5;
      const eligible     = sessionCount >= 4;

      let awarded = false;
      let reason: string | null = null;

      if (eligible) {
        totalEligibleUsers++;
        totalBonusExpected++;

        if (!weekKeyExists) {
          awarded = false;
          reason  = "Migration 20260720000001_points_enhancements.sql not run — week_key column missing";
        } else {
          awarded = bonusLedgerSet.has(`${email}::${wk}`);
          if (!awarded) {
            reason = "No weekly_bonus row found in points_ledger for this user+week";
          }
        }

        if (awarded) {
          totalBonusAwarded++;
        } else {
          discrepancies.push({
            email,
            name,
            week_start:   wk,
            week_end:     weekEnd,
            week_label:   weekLabel,
            sessions_count: sessionCount,
            root_cause:   reason,
            fix: weekKeyExists
              ? `INSERT INTO points_ledger (user_email, session_id, points, reason, category, awarded_by, week_key) VALUES ('${email}', '${sessions[sessions.length - 1].session_id}', 5, 'Weekly Attendance Bonus — week of ${wk} (manual fix)', 'weekly_bonus', 'system', '${wk}') ON CONFLICT DO NOTHING;`
              : "Run supabase/migrations/20260720000001_points_enhancements.sql first, then call POST /api/admin/points/recalculate",
          });
        }
      } else {
        reason = sessionCount === 0
          ? "No attended sessions this week"
          : `Only ${sessionCount} session${sessionCount !== 1 ? "s" : ""} attended — minimum 4 required`;
      }

      usersInWeek.push({
        email,
        name,
        sessions_in_week:   sessionCount,
        attendance_dates:   sessions.map(s => s.date),
        session_titles:     sessions.map(s => s.title),
        attendance_pts:     attPts,
        bonus_eligible:     eligible,
        bonus_awarded:      eligible ? awarded : null, // null = N/A (not eligible)
        reason:             !eligible ? reason : (!awarded ? reason : null),
      });
    }

    weeks.push({
      week_start: wk,
      week_end:   weekEnd,
      week_label: weekLabel,
      total_users_attending:  allUsersThisWeek.length,
      users_eligible_for_bonus: usersInWeek.filter(u => u.bonus_eligible).length,
      users_awarded_bonus:      usersInWeek.filter(u => u.bonus_awarded === true).length,
      users,
    });

    // Rebuild to avoid the naming collision with `users` variable above
    const weekRecord = weeks[weeks.length - 1] as Record<string, unknown>;
    delete weekRecord["users"];
    weekRecord["users"] = usersInWeek;
  }

  return NextResponse.json({
    month,
    generated_at:        new Date().toISOString(),
    week_key_column_exists: weekKeyExists,
    note: !weekKeyExists
      ? "IMPORTANT: week_key column does not exist — run migration 20260720000001_points_enhancements.sql"
      : null,
    weeks,
    summary: {
      total_sessions_in_month:  sessions.length,
      total_users_with_attendance: emails.length,
      total_users_eligible:     totalEligibleUsers,
      total_bonuses_expected:   totalBonusExpected,
      total_bonuses_awarded:    totalBonusAwarded,
      discrepancies:            discrepancies.length,
    },
    discrepancies,
  });
}
