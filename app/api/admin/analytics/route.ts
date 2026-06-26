import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/analytics
// Returns platform-wide analytics for the organizer dashboard.
// All data computed from existing tables — no dedicated analytics tables required.
//
// Query params:
//   months  int  how many months to look back (default 6, max 12)

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const months  = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get("months") ?? "6", 10)));
  const db      = getSupabaseServer();
  const now     = new Date();

  // ── Date helpers ──────────────────────────────────────────────────────────
  function monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function monthStart(offset: number): string {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return d.toISOString();
  }

  // Build ordered month labels (oldest → newest)
  const monthLabels: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(monthKey(d));
  }

  const since = monthStart(months - 1);

  // ── Parallel data fetches ─────────────────────────────────────────────────
  const [
    invoicesRes,
    usersRes,
    membershipsRes,
    eventRegsRes,
    checkinRes,
    eventsRes,
  ] = await Promise.all([
    // Revenue: all paid invoices in window (only amount + date)
    db.from("invoices")
      .select("total_amount, created_at")
      .gte("created_at", since)
      .gt("total_amount", 0),

    // User signups: all users in window
    db.from("users")
      .select("created_at")
      .gte("created_at", since),

    // Active memberships right now
    db.from("memberships")
      .select("status, expires_at, started_at, amount_paid"),

    // Event registrations in window
    db.from("event_registrations")
      .select("payment_status, final_price, created_at, checked_in_at, status")
      .gte("created_at", since)
      .eq("status", "confirmed"),

    // Total check-ins ever (for event attendance rate)
    db.from("event_registrations")
      .select("id", { count: "exact", head: true })
      .not("checked_in_at", "is", null),

    // Events by month
    db.from("events")
      .select("status, start_date, created_at")
      .gte("created_at", since),
  ]);

  // ── Revenue by month ───────────────────────────────────────────────────────
  const revenueByMonth: Record<string, number> = {};
  for (const label of monthLabels) revenueByMonth[label] = 0;
  for (const inv of invoicesRes.data ?? []) {
    const mk = monthKey(new Date(inv.created_at));
    if (mk in revenueByMonth) revenueByMonth[mk] += inv.total_amount ?? 0;
  }

  // ── New users by month ─────────────────────────────────────────────────────
  const usersByMonth: Record<string, number> = {};
  for (const label of monthLabels) usersByMonth[label] = 0;
  for (const u of usersRes.data ?? []) {
    const mk = monthKey(new Date(u.created_at));
    if (mk in usersByMonth) usersByMonth[mk]++;
  }

  // ── Event registrations by month ──────────────────────────────────────────
  const regsByMonth: Record<string, number> = {};
  for (const label of monthLabels) regsByMonth[label] = 0;
  for (const r of eventRegsRes.data ?? []) {
    const mk = monthKey(new Date(r.created_at));
    if (mk in regsByMonth) regsByMonth[mk]++;
  }

  // ── Membership summary ────────────────────────────────────────────────────
  const now_iso  = now.toISOString();
  const allMems  = membershipsRes.data ?? [];
  const activeMemberships   = allMems.filter(m => m.status === "active" && m.expires_at > now_iso).length;
  const membershipRevenue   = allMems.reduce((s, m) => s + (m.amount_paid ?? 0), 0);

  // New memberships per month (from started_at in window)
  const memsByMonth: Record<string, number> = {};
  for (const label of monthLabels) memsByMonth[label] = 0;
  for (const m of allMems) {
    if (!m.started_at) continue;
    const mk = monthKey(new Date(m.started_at));
    if (mk in memsByMonth) memsByMonth[mk]++;
  }

  // ── Event registrations summary ───────────────────────────────────────────
  const regs          = eventRegsRes.data ?? [];
  const totalRegs     = regs.length;
  const paidRegs      = regs.filter(r => r.payment_status === "paid").length;
  const freeRegs      = regs.filter(r => r.payment_status === "free").length;
  const eventRevenue  = regs.filter(r => r.payment_status === "paid").reduce((s, r) => s + (r.final_price ?? 0), 0);
  const checkedInCount = checkinRes.count ?? 0;
  const checkInRate   = totalRegs > 0 ? Math.round((checkedInCount / totalRegs) * 100) : 0;

  // ── Events ────────────────────────────────────────────────────────────────
  const allEvents         = eventsRes.data ?? [];
  const publishedEvents   = allEvents.filter(e => e.status === "published").length;
  const upcomingEvents    = allEvents.filter(e => e.status === "published" && e.start_date >= now.toISOString().slice(0, 10)).length;

  // ── Summary cards ─────────────────────────────────────────────────────────
  const totalRevenue  = invoicesRes.data?.reduce((s, i) => s + (i.total_amount ?? 0), 0) ?? 0;
  const totalNewUsers = usersRes.data?.length ?? 0;

  // ── Growth rates (vs prior period) ────────────────────────────────────────
  function growthRate(current: number, prior: number): number {
    if (prior === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prior) / prior) * 100);
  }

  const latestMonth = monthLabels[monthLabels.length - 1];
  const prevMonth   = monthLabels[monthLabels.length - 2] ?? "";

  const revenueGrowth = growthRate(revenueByMonth[latestMonth] ?? 0, revenueByMonth[prevMonth] ?? 0);
  const userGrowth    = growthRate(usersByMonth[latestMonth]   ?? 0, usersByMonth[prevMonth]   ?? 0);
  const regGrowth     = growthRate(regsByMonth[latestMonth]    ?? 0, regsByMonth[prevMonth]    ?? 0);

  return NextResponse.json({
    period: { months, since, labels: monthLabels },

    // Summary cards
    summary: {
      total_revenue:     totalRevenue,
      event_revenue:     eventRevenue,
      membership_revenue: membershipRevenue,
      active_memberships: activeMemberships,
      total_new_users:   totalNewUsers,
      total_registrations: totalRegs,
      paid_registrations:  paidRegs,
      free_registrations:  freeRegs,
      events_published:   publishedEvents,
      events_upcoming:    upcomingEvents,
      check_in_rate:      checkInRate,
    },

    // Growth vs prior month
    growth: {
      revenue: revenueGrowth,
      users:   userGrowth,
      registrations: regGrowth,
    },

    // Trend series (array of values aligned to `labels`)
    trends: {
      revenue:       monthLabels.map(m => revenueByMonth[m]   ?? 0),
      new_users:     monthLabels.map(m => usersByMonth[m]     ?? 0),
      registrations: monthLabels.map(m => regsByMonth[m]      ?? 0),
      memberships:   monthLabels.map(m => memsByMonth[m]      ?? 0),
    },
  });
}
