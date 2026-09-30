import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// IST offset: +5h 30m
const IST_MS = 5.5 * 60 * 60 * 1000;

function toISTDateStr(utcIso: string): string {
  const t = new Date(utcIso).getTime() + IST_MS;
  return new Date(t).toISOString().split("T")[0];
}

// GET /api/it-run/admin/dashboard
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // ── 1. Fetch current event ─────────────────────────────────────────────────
  const { data: event } = await db
    .from("it_run_events")
    .select("id, title, event_date")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const eventId = event.id;

  // ── 2. Fetch all data in parallel ─────────────────────────────────────────
  const [regsRes, partsRes, catRes] = await Promise.all([
    db.from("it_run_registrations")
      .select("id,category_id,participant_count,payment_status,registration_status,final_price,discount_amount,coupon_id,created_at")
      .eq("event_id", eventId),
    db.from("it_run_participants")
      .select("id,gender,participant_type,verification_status")
      .eq("event_id", eventId),
    db.from("it_run_categories")
      .select("id,name,price_rupees,max_participants,color,is_active,category_type")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const regs  = regsRes.data  ?? [];
  const parts = partsRes.data ?? [];
  const cats  = catRes.data   ?? [];

  // ── 3. Registration segmentation (event-scoped, status-aware) ─────────────
  // Active = not administratively cancelled
  const activeRegs      = regs.filter(r => r.registration_status === "active");
  const cancelledRegs   = regs.filter(r => r.registration_status === "cancelled");
  // Confirmed = payment complete
  const confirmedRegs   = activeRegs.filter(r => r.payment_status === "paid" || r.payment_status === "free");
  const paidRegs        = activeRegs.filter(r => r.payment_status === "paid");
  const freeRegs        = activeRegs.filter(r => r.payment_status === "free");
  const pendingRegs     = activeRegs.filter(r => r.payment_status === "pending");
  const expiredRegs     = activeRegs.filter(r => r.payment_status === "expired");
  const failedRegs      = activeRegs.filter(r => r.payment_status === "failed");

  // ── 4. Revenue (only active paid registrations, actual amounts stored) ────
  const grossRevenue    = paidRegs.reduce((s, r) => s + (r.final_price ?? 0), 0);
  const totalDiscounts  = confirmedRegs.reduce((s, r) => s + (r.discount_amount ?? 0), 0);

  // ── 5. Participant count from confirmed registrations ─────────────────────
  // Uses participant_count per registration (1 for solo, 2 for duo/kid)
  // This is authoritative — avoids counting participants from pending/failed regs
  const totalParticipants = confirmedRegs.reduce((s, r) => s + (r.participant_count ?? 1), 0);
  // Total including pending (they've registered but not yet paid)
  const totalActiveParticipants = activeRegs
    .filter(r => r.payment_status === "paid" || r.payment_status === "free" || r.payment_status === "pending")
    .reduce((s, r) => s + (r.participant_count ?? 1), 0);

  // ── 6. Verification stats (from actual participant records) ───────────────
  const verificationStats = {
    total:              parts.length,
    pending:            parts.filter(p => p.verification_status === "pending").length,
    verified:           parts.filter(p => p.verification_status === "verified").length,
    rejected:           parts.filter(p => p.verification_status === "rejected").length,
    need_clarification: parts.filter(p => p.verification_status === "need_clarification").length,
  };

  // ── 7. BIBs and check-ins (event-scoped via participant join) ─────────────
  // it_run_bib_collections and it_run_checkins don't have event_id;
  // must scope through participant IDs belonging to this event.
  const partIds = parts.map(p => p.id);

  let bibsCollected = 0;
  let checkedIn = 0;

  if (partIds.length > 0) {
    const [bibRes, checkinRes] = await Promise.all([
      db.from("it_run_bib_collections").select("id", { count: "exact", head: true }).in("participant_id", partIds),
      db.from("it_run_checkins").select("id", { count: "exact", head: true }).in("participant_id", partIds),
    ]);
    bibsCollected = bibRes.count ?? 0;
    checkedIn     = checkinRes.count ?? 0;
  }

  // ── 8. Category breakdown from actual registrations (not stale counter) ───
  // Count CONFIRMED registrations per category (paid + free, registration_status = active)
  const catRegCount: Record<string, number> = {};
  const catPartCount: Record<string, number> = {};
  for (const r of confirmedRegs) {
    catRegCount[r.category_id]  = (catRegCount[r.category_id]  ?? 0) + 1;
    catPartCount[r.category_id] = (catPartCount[r.category_id] ?? 0) + (r.participant_count ?? 1);
  }
  // Also compute pending per category
  const catPendingCount: Record<string, number> = {};
  for (const r of pendingRegs) {
    catPendingCount[r.category_id] = (catPendingCount[r.category_id] ?? 0) + 1;
  }

  const categoryStats = cats.map(c => ({
    id:              c.id,
    name:            c.name,
    color:           c.color,
    price:           c.price_rupees,
    categoryType:    c.category_type,
    confirmedRegs:   catRegCount[c.id]    ?? 0,
    confirmedParts:  catPartCount[c.id]   ?? 0,
    pendingRegs:     catPendingCount[c.id] ?? 0,
    maxParticipants: c.max_participants,
  }));

  // ── 9. Gender breakdown (from actual participant records) ─────────────────
  const genderBreakdown = {
    male:           parts.filter(p => p.gender === "male").length,
    female:         parts.filter(p => p.gender === "female").length,
    other:          parts.filter(p => p.gender === "other" || p.gender === "prefer_not").length,
  };

  // ── 10. Daily registrations chart (IST dates) ─────────────────────────────
  // Only count confirmed + pending active registrations (exclude failed/expired/cancelled)
  const chartRegs = activeRegs.filter(r =>
    r.payment_status === "paid" || r.payment_status === "free" || r.payment_status === "pending"
  );
  const nowIST = Date.now() + IST_MS;
  const dailyRegistrations = Array.from({ length: 7 }, (_, i) => {
    const d   = new Date(nowIST - i * 86400000);
    const day = d.toISOString().split("T")[0]; // IST date as YYYY-MM-DD
    return {
      date:  day,
      count: chartRegs.filter(r => r.created_at ? toISTDateStr(r.created_at) === day : false).length,
    };
  }).reverse();

  // ── 11. Coupon usage ───────────────────────────────────────────────────────
  const couponRegs        = confirmedRegs.filter(r => r.coupon_id !== null);
  const couponDiscountSum = couponRegs.reduce((s, r) => s + (r.discount_amount ?? 0), 0);

  // ── 12. Reconciliation totals ──────────────────────────────────────────────
  const reconciliation = {
    totalRegistrationsInDB: regs.length,
    active:   activeRegs.length,
    cancelled: cancelledRegs.length,
    confirmed: confirmedRegs.length,
    pending:   pendingRegs.length,
    expired:   expiredRegs.length,
    failed:    failedRegs.length,
    activeParticipantCount:    totalActiveParticipants,
    confirmedParticipantCount: totalParticipants,
    dbParticipantCount:        parts.length,
  };

  return NextResponse.json({
    event: {
      title:      event.title,
      event_date: event.event_date,
    },
    summary: {
      // "Total registrations" = all active (paid+free+pending), excludes cancelled/failed/expired
      totalRegistrations:   pendingRegs.length + confirmedRegs.length,
      confirmedRegistrations: confirmedRegs.length,
      paidRegistrations:    paidRegs.length,
      freeRegistrations:    freeRegs.length,
      pendingRegistrations: pendingRegs.length,
      expiredRegistrations: expiredRegs.length,
      failedRegistrations:  failedRegs.length,
      cancelledRegistrations: cancelledRegs.length,
      // Participants from confirmed registrations only (paid + free)
      totalParticipants,
      // Revenue from active paid registrations using stored final_price
      grossRevenue,
      totalDiscounts,
      netRevenue: grossRevenue,
      // Coupons
      couponRegistrations: couponRegs.length,
      couponDiscount:      couponDiscountSum,
      // Event day
      bibsCollected,
      bibsTotal: parts.length,
      checkedIn,
      checkInTotal: totalParticipants,
    },
    verificationStats,
    genderBreakdown,
    categoryStats,
    dailyRegistrations,
    reconciliation,
    lastUpdated: new Date().toISOString(),
  });
}
