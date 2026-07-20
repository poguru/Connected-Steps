import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const IST_MS = 5.5 * 60 * 60 * 1000;

function todayIST(): string {
  return new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
}

function mondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const CATEGORY_LABELS: Record<string, string> = {
  attendance:       "Session Attendance",
  weekly_bonus:     "Weekly Attendance Bonus",
  bonus:            "Admin Bonus",
  challenge:        "Challenge Award",
  referral:         "Referral Reward",
  strava:           "Strava Reward",
  admin_adjustment: "Admin Adjustment",
  streak:           "Streak Reward",
};

const CATEGORY_ICONS: Record<string, string> = {
  attendance:       "🏃",
  weekly_bonus:     "🏆",
  bonus:            "⭐",
  challenge:        "🎯",
  referral:         "🔗",
  strava:           "🚴",
  admin_adjustment: "⚙️",
  streak:           "🔥",
};

// GET /api/points/history
// Headers: x-user-token
// Query:   page=1 limit=20 category=all|attendance|weekly_bonus|... from=YYYY-MM-DD to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page     = Math.max(1, parseInt(searchParams.get("page")  ?? "1", 10));
  const limit    = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") ?? "20", 10)));
  const category = searchParams.get("category") ?? "all";
  const from     = searchParams.get("from");
  const to       = searchParams.get("to");

  const db = getSupabaseServer();
  const email = userEmail.toLowerCase();

  // ── 1. Leaderboard summary (total + rank) ─────────────────────────────────
  const { data: lb } = await db
    .from("leaderboard")
    .select("month_points, total_points, points_month, rank")
    .eq("user_email", email)
    .single();

  const currentMonth = new Date(Date.now() + IST_MS).toISOString().slice(0, 7);
  const month_points = lb?.points_month === currentMonth ? (lb?.month_points ?? 0) : 0;
  const total_points = lb?.total_points ?? 0;

  // ── 2. Week progress ──────────────────────────────────────────────────────
  const weekStart  = mondayOfWeek(todayIST());
  const weekEndObj = new Date(weekStart + "T00:00:00Z");
  weekEndObj.setUTCDate(weekEndObj.getUTCDate() + 6);
  const weekEnd = weekEndObj.toISOString().slice(0, 10);

  // Fetch session IDs in this ISO week
  const { data: weekSessions } = await db
    .from("sessions")
    .select("id")
    .gte("date", weekStart)
    .lte("date", weekEnd);

  const weekSessionIds = (weekSessions ?? []).map(s => s.id);

  let weekSessionsCount = 0;
  let weekBonusEarned   = false;

  if (weekSessionIds.length > 0) {
    const { count: wCount } = await db
      .from("session_attendance")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("attended", true)
      .in("session_id", weekSessionIds);
    weekSessionsCount = wCount ?? 0;
    weekBonusEarned   = weekSessionsCount >= 4;
  }

  // ── 3. Fetch ALL ledger rows for the user (for running total) ─────────────
  // Ordered ASC so we can compute a running total left-to-right.
  const { data: allRows, error: allErr } = await db
    .from("points_ledger")
    .select("id, session_id, points, reason, category, awarded_by, week_key, created_at, sessions(id, title, date)")
    .eq("user_email", email)
    .order("created_at", { ascending: true });

  if (allErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Compute running total (ascending order)
  type LedgerRow = {
    id: number;
    session_id: string | null;
    points: number;
    reason: string;
    category: string;
    awarded_by: string | null;
    week_key: string | null;
    created_at: string;
    sessions: { id: string; title: string; date: string } | { id: string; title: string; date: string }[] | null;
    running_total: number;
    session_title: string | null;
    session_date: string | null;
    label: string;
    icon: string;
  };

  let runningTotal = 0;
  const enriched: LedgerRow[] = (allRows ?? []).map(row => {
    runningTotal += row.points;
    const sessRaw = row.sessions as unknown;
    const sess = Array.isArray(sessRaw) ? (sessRaw[0] ?? null) : sessRaw as { id: string; title: string; date: string } | null;
    return {
      ...row,
      running_total: runningTotal,
      session_title: sess?.title ?? null,
      session_date:  sess?.date  ?? null,
      label: CATEGORY_LABELS[row.category] ?? row.reason,
      icon:  CATEGORY_ICONS[row.category]  ?? "✦",
      sessions: row.sessions as LedgerRow["sessions"],
    };
  });

  // ── 4. Apply filters on the enriched list ─────────────────────────────────
  let filtered = [...enriched];
  if (category !== "all") {
    filtered = filtered.filter(r => r.category === category);
  }
  if (from) {
    filtered = filtered.filter(r => r.created_at.slice(0, 10) >= from);
  }
  if (to) {
    filtered = filtered.filter(r => r.created_at.slice(0, 10) <= to);
  }

  // ── 5. Paginate (most recent first) ──────────────────────────────────────
  const total_count = filtered.length;
  const total_pages = Math.max(1, Math.ceil(total_count / limit));
  const safePage    = Math.min(page, total_pages);
  const offset      = (safePage - 1) * limit;

  // Reverse so most recent is first, then slice
  const paged = filtered.slice().reverse().slice(offset, offset + limit);

  return NextResponse.json({
    transactions: paged,
    page:         safePage,
    total_pages,
    total_count,
    summary: {
      total_points,
      month_points,
      rank: lb?.rank ?? null,
    },
    week: {
      sessions_count:  weekSessionsCount,
      bonus_earned:    weekBonusEarned,
      sessions_needed: Math.max(0, 4 - weekSessionsCount),
    },
  });
}
