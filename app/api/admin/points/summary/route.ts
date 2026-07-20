import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const IST_MS = 5.5 * 60 * 60 * 1000;

// GET /api/admin/points/summary
// Returns aggregate stats by category + top earners.
// Query: month=YYYY-MM (defaults to current IST month, "all" for all time)
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const currentMonth = new Date(Date.now() + IST_MS).toISOString().slice(0, 7);
  const month = (!monthParam || monthParam === "current") ? currentMonth : monthParam;

  const db = getSupabaseServer();

  // ── Category aggregates from points_ledger ────────────────────────────────
  let query = db
    .from("points_ledger")
    .select("category, points");

  if (month !== "all") {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    query = query
      .gte("created_at", `${month}-01T00:00:00Z`)
      .lte("created_at", `${month}-${String(lastDay).padStart(2, "0")}T23:59:59Z`);
  }

  const { data: ledgerRows, error: ledgerErr } = await query;
  if (ledgerErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const categoryTotals: Record<string, { points: number; count: number }> = {};
  let grandTotal = 0;

  for (const row of ledgerRows ?? []) {
    if (!categoryTotals[row.category]) {
      categoryTotals[row.category] = { points: 0, count: 0 };
    }
    categoryTotals[row.category].points += row.points;
    categoryTotals[row.category].count  += 1;
    grandTotal += row.points;
  }

  const by_category = Object.entries(categoryTotals)
    .map(([category, { points, count }]) => ({ category, points, count }))
    .sort((a, b) => b.points - a.points);

  // ── Top earners from leaderboard ──────────────────────────────────────────
  // For current month: use month_points. For all time: use total_points.
  const isCurrentMonth = month === currentMonth;
  const sortCol = (month === "all" || !isCurrentMonth) ? "total_points" : "month_points";

  const { data: topEarners } = await db
    .from("leaderboard")
    .select("user_email, user_name, month_points, total_points, points_month")
    .order(sortCol, { ascending: false })
    .limit(10);

  const top_earners = (topEarners ?? []).map((e, i) => ({
    rank:         i + 1,
    user_email:   e.user_email,
    user_name:    e.user_name,
    month_points: e.points_month === currentMonth ? (e.month_points ?? 0) : 0,
    total_points: e.total_points ?? 0,
  }));

  // ── Active users count ────────────────────────────────────────────────────
  const { count: activeUsers } = await db
    .from("leaderboard")
    .select("user_email", { count: "exact", head: true });

  return NextResponse.json({
    month,
    grand_total:  grandTotal,
    active_users: activeUsers ?? 0,
    by_category,
    top_earners,
  });
}
