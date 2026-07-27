/**
 * Finance Service — aggregation utilities for the Commerce & Finance Platform.
 * Reads from existing tables (event_registrations, invoices, memberships,
 * cancellation_requests) plus new tables (merchandise_orders, donations,
 * sponsor_agreements, manual_payment_records, payouts).
 * All returned amounts are in PAISE unless suffixed _rupees.
 */

import { getSupabaseServer } from "@/lib/supabase-server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FinanceSummary {
  gross_revenue_paise:        number;   // all captured payments
  net_revenue_paise:          number;   // gross minus refunds
  pending_payments_paise:     number;   // unpaid / pending
  refunded_paise:             number;   // total refunded
  failed_payments_paise:      number;   // failed Razorpay payments
  coupon_discounts_paise:     number;   // sum of coupon_discount across registrations
  event_revenue_paise:        number;
  membership_revenue_paise:   number;
  merchandise_revenue_paise:  number;
  donation_revenue_paise:     number;
  sponsor_revenue_paise:      number;
  manual_payments_paise:      number;
  payouts_pending_paise:      number;
  payouts_paid_paise:         number;
  platform_fees_paise:        number;   // estimated Razorpay 2% + 18% GST on fee
  gst_collected_rupees:       number;   // from invoices (composition scheme = 0 collected)
}

export interface FinanceDashboardFilters {
  organization_id?: string;
  event_id?:        string;
  date_from?:       string;  // ISO date
  date_to?:         string;  // ISO date
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function paiseToRupees(p: number): number {
  return Math.round(p) / 100;
}

function rupeesToPaise(r: number): number {
  return Math.round(r * 100);
}

/** Razorpay fee = 2% + 18% GST on fee ≈ 2.36% of amount */
function estimatePlatformFee(amount_paise: number): number {
  const fee      = amount_paise * 0.02;
  const gst_fee  = fee * 0.18;
  return Math.round(fee + gst_fee);
}

// ── Core dashboard aggregation ────────────────────────────────────────────────

export async function getFinanceDashboard(
  filters: FinanceDashboardFilters,
): Promise<FinanceSummary> {
  const db = getSupabaseServer();
  const { organization_id, event_id, date_from, date_to } = filters;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyRegFilters = (q: any): any => {
    if (date_from) q = q.gte("created_at", date_from);
    if (date_to)   q = q.lte("created_at", date_to + "T23:59:59Z");
    return q;
  };

  // 1. Event registrations — paid
  let regQ = db
    .from("event_registrations")
    .select("final_price, original_price, coupon_discount, refund_status, refund_amount, payment_status")
    .eq("payment_status", "paid");

  if (event_id) {
    regQ = regQ.eq("event_id", event_id) as typeof regQ;
  } else if (organization_id) {
    // Filter via events.organization_id
    const { data: orgEvents } = await db
      .from("events")
      .select("id")
      .eq("organization_id", organization_id);
    const eventIds = (orgEvents ?? []).map((e: { id: string }) => e.id);
    if (eventIds.length === 0) {
      return buildEmpty();
    }
    regQ = regQ.in("event_id", eventIds) as typeof regQ;
  }
  regQ = applyRegFilters(regQ);

  // 2. Pending registrations
  let pendingQ = db
    .from("event_registrations")
    .select("final_price")
    .eq("payment_status", "pending")
    .not("razorpay_order_id", "is", null);

  if (event_id) {
    pendingQ = pendingQ.eq("event_id", event_id) as typeof pendingQ;
  } else if (organization_id) {
    const { data: orgEvts } = await db.from("events").select("id").eq("organization_id", organization_id);
    const ids = (orgEvts ?? []).map((e: { id: string }) => e.id);
    if (ids.length > 0) pendingQ = pendingQ.in("event_id", ids) as typeof pendingQ;
  }
  pendingQ = applyRegFilters(pendingQ);

  // 3. Membership revenue — paid memberships
  let memberQ = db
    .from("memberships")
    .select("amount_paid")
    .eq("payment_status", "active");
  if (organization_id) {
    const { data: plans } = await db
      .from("membership_plans")
      .select("id")
      .eq("organization_id", organization_id);
    const planIds = (plans ?? []).map((p: { id: string }) => p.id);
    if (planIds.length > 0) memberQ = memberQ.in("plan_id", planIds) as typeof memberQ;
  }
  if (date_from) memberQ = memberQ.gte("created_at", date_from) as typeof memberQ;
  if (date_to)   memberQ = memberQ.lte("created_at", date_to + "T23:59:59Z") as typeof memberQ;

  // 4. Merchandise orders — paid
  let merchQ = db
    .from("merchandise_orders")
    .select("total_paise, subtotal_paise, gst_paise")
    .eq("payment_status", "paid");
  if (organization_id) merchQ = merchQ.eq("organization_id", organization_id) as typeof merchQ;
  if (event_id)        merchQ = merchQ.eq("event_id", event_id) as typeof merchQ;
  if (date_from)       merchQ = merchQ.gte("created_at", date_from) as typeof merchQ;
  if (date_to)         merchQ = merchQ.lte("created_at", date_to + "T23:59:59Z") as typeof merchQ;

  // 5. Donations — all recorded
  let donQ = db.from("donations").select("amount_paise");
  if (organization_id) donQ = donQ.eq("organization_id", organization_id) as typeof donQ;
  if (event_id)        donQ = donQ.eq("event_id", event_id) as typeof donQ;
  if (date_from)       donQ = donQ.gte("created_at", date_from) as typeof donQ;
  if (date_to)         donQ = donQ.lte("created_at", date_to + "T23:59:59Z") as typeof donQ;

  // 6. Sponsor agreements — paid or partial
  let sponsorQ = db
    .from("sponsor_agreements")
    .select("amount_received_paise")
    .in("payment_status", ["paid", "partial"]);
  if (organization_id) sponsorQ = sponsorQ.eq("organization_id", organization_id) as typeof sponsorQ;
  if (event_id)        sponsorQ = sponsorQ.eq("event_id", event_id) as typeof sponsorQ;
  if (date_from)       sponsorQ = sponsorQ.gte("created_at", date_from) as typeof sponsorQ;
  if (date_to)         sponsorQ = sponsorQ.lte("created_at", date_to + "T23:59:59Z") as typeof sponsorQ;

  // 7. Manual payments
  let manualQ = db.from("manual_payment_records").select("amount_paise");
  if (organization_id) manualQ = manualQ.eq("organization_id", organization_id) as typeof manualQ;
  if (event_id)        manualQ = manualQ.eq("event_id", event_id) as typeof manualQ;
  if (date_from)       manualQ = manualQ.gte("created_at", date_from) as typeof manualQ;
  if (date_to)         manualQ = manualQ.lte("created_at", date_to + "T23:59:59Z") as typeof manualQ;

  // 8. Payouts
  let payoutPendingQ = db.from("payouts").select("amount_paise").eq("status", "pending");
  let payoutPaidQ    = db.from("payouts").select("amount_paise").eq("status", "paid");
  if (organization_id) {
    payoutPendingQ = payoutPendingQ.eq("organization_id", organization_id) as typeof payoutPendingQ;
    payoutPaidQ    = payoutPaidQ.eq("organization_id", organization_id) as typeof payoutPaidQ;
  }

  // Run all queries in parallel
  const [
    { data: regs },
    { data: pending },
    { data: members },
    { data: merch },
    { data: donations },
    { data: sponsors },
    { data: manuals },
    { data: payoutsPending },
    { data: payoutsPaid },
  ] = await Promise.all([
    regQ,
    pendingQ,
    memberQ,
    merchQ,
    donQ,
    sponsorQ,
    manualQ,
    payoutPendingQ,
    payoutPaidQ,
  ]);

  // Aggregate event registrations
  let event_revenue = 0;
  let coupon_discounts = 0;
  let refunded = 0;

  for (const r of regs ?? []) {
    const amt = rupeesToPaise(r.final_price ?? 0);
    event_revenue  += amt;
    coupon_discounts += rupeesToPaise(r.coupon_discount ?? 0);
    if (r.refund_status === "refunded" || r.refund_status === "partial_refund") {
      refunded += rupeesToPaise(r.refund_amount ?? 0);
    }
  }

  const pending_payments = (pending ?? []).reduce(
    (s: number, r: { final_price: number | null }) => s + rupeesToPaise(r.final_price ?? 0), 0
  );

  const membership_revenue = (members ?? []).reduce(
    (s: number, m: { amount_paid: number | null }) => s + rupeesToPaise(m.amount_paid ?? 0), 0
  );

  const merchandise_revenue = (merch ?? []).reduce(
    (s: number, m: { total_paise: number }) => s + (m.total_paise ?? 0), 0
  );

  const donation_revenue = (donations ?? []).reduce(
    (s: number, d: { amount_paise: number }) => s + (d.amount_paise ?? 0), 0
  );

  const sponsor_revenue = (sponsors ?? []).reduce(
    (s: number, ag: { amount_received_paise: number }) => s + (ag.amount_received_paise ?? 0), 0
  );

  const manual_payments = (manuals ?? []).reduce(
    (s: number, m: { amount_paise: number }) => s + (m.amount_paise ?? 0), 0
  );

  const payouts_pending_paise = (payoutsPending ?? []).reduce(
    (s: number, p: { amount_paise: number }) => s + (p.amount_paise ?? 0), 0
  );

  const payouts_paid_paise = (payoutsPaid ?? []).reduce(
    (s: number, p: { amount_paise: number }) => s + (p.amount_paise ?? 0), 0
  );

  const gross_revenue = event_revenue + membership_revenue + merchandise_revenue + donation_revenue + sponsor_revenue + manual_payments;
  const net_revenue   = gross_revenue - refunded;

  return {
    gross_revenue_paise:        gross_revenue,
    net_revenue_paise:          net_revenue,
    pending_payments_paise:     pending_payments,
    refunded_paise:             refunded,
    failed_payments_paise:      0,   // would need separate Razorpay query — omit for now
    coupon_discounts_paise:     coupon_discounts,
    event_revenue_paise:        event_revenue,
    membership_revenue_paise:   membership_revenue,
    merchandise_revenue_paise:  merchandise_revenue,
    donation_revenue_paise:     donation_revenue,
    sponsor_revenue_paise:      sponsor_revenue,
    manual_payments_paise:      manual_payments,
    payouts_pending_paise,
    payouts_paid_paise,
    platform_fees_paise:        estimatePlatformFee(event_revenue + membership_revenue),
    gst_collected_rupees:       0,   // composition scheme — no tax collected from customer
  };
}

function buildEmpty(): FinanceSummary {
  return {
    gross_revenue_paise: 0, net_revenue_paise: 0, pending_payments_paise: 0,
    refunded_paise: 0, failed_payments_paise: 0, coupon_discounts_paise: 0,
    event_revenue_paise: 0, membership_revenue_paise: 0, merchandise_revenue_paise: 0,
    donation_revenue_paise: 0, sponsor_revenue_paise: 0, manual_payments_paise: 0,
    payouts_pending_paise: 0, payouts_paid_paise: 0, platform_fees_paise: 0,
    gst_collected_rupees: 0,
  };
}

// ── Write financial audit entry ───────────────────────────────────────────────

export async function writeFinancialAudit(params: {
  organization_id: string;
  event_id?:       string;
  action:          string;
  actor_email:     string;
  entity_type:     string;
  entity_id?:      string;
  amount_paise?:   number;
  detail?:         Record<string, unknown>;
  ip?:             string;
}): Promise<void> {
  try {
    const db = getSupabaseServer();
    await db.from("financial_audit_log").insert({
      organization_id: params.organization_id,
      event_id:        params.event_id ?? null,
      action:          params.action,
      actor_email:     params.actor_email,
      entity_type:     params.entity_type,
      entity_id:       params.entity_id ?? null,
      amount_paise:    params.amount_paise ?? null,
      detail:          params.detail ?? null,
      ip:              params.ip ?? null,
    });
  } catch {
    // Audit failure must never break the main request
  }
}

// ── Format helpers (server-side) ──────────────────────────────────────────────

export function formatRupees(paise: number): string {
  return `₹${paiseToRupees(paise).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export { paiseToRupees, rupeesToPaise };
