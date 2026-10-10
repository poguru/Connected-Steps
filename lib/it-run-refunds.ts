/**
 * IT Run refund state transitions (shared by the admin refund route and the Razorpay webhook).
 *
 * Rules:
 * - A refund row is created as `pending` BEFORE Razorpay is called. The partial unique index
 *   `it_run_refunds_one_pending_per_registration` makes a second concurrent attempt fail.
 * - `processed` is set only from Razorpay's server-side response (status "processed") or a
 *   verified `refund.processed` webhook, never from the browser.
 * - Finalization is guarded by `status = 'pending'`, so a duplicate webhook or retry cannot
 *   release capacity or coupons twice.
 * - Registration cancellation and capacity/coupon release happen ONLY when a refund is
 *   processed AND the cumulative refunded amount covers the full final price. A refund
 *   request, an approval, or a pending refund never cancels a registration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listRefundsForPayment } from "@/lib/razorpay-client";

type Db = SupabaseClient;

export const OPEN_REFUND_STATUSES = ["pending", "processed"] as const;

/** Sum of refunds that count against the original payment (pending + processed). */
export async function getRefundedAmountPaise(db: Db, registrationId: string): Promise<number> {
  const { data, error } = await db
    .from("it_run_refunds")
    .select("amount_paise, status")
    .eq("registration_id", registrationId)
    .in("status", [...OPEN_REFUND_STATUSES]);

  if (error) throw new Error(`Failed to read refunds: ${error.message}`);
  return (data ?? []).reduce((sum, r: { amount_paise: number }) => sum + r.amount_paise, 0);
}

/**
 * Marks a pending refund as processed and, if the cumulative refund covers the full price,
 * cancels the registration and releases capacity and coupon.
 * Returns false when the refund was not pending (already finalized or failed) — callers must
 * treat that as a no-op.
 */
export async function finalizeRefundProcessed(
  db: Db,
  refundId: string,
  razorpayRefundId: string | null,
  actor: string,
): Promise<boolean> {
  const now = new Date().toISOString();

  // Read everything that can make this refund invalid BEFORE taking the pending -> processed lock.
  // Once the lock is taken, a failure would leave the money refunded but the registration unchanged.
  const { data: pendingRow } = await db
    .from("it_run_refunds")
    .select("id, registration_id, amount_paise, status")
    .eq("id", refundId)
    .maybeSingle<{ id: string; registration_id: string; amount_paise: number; status: string }>();
  if (!pendingRow || pendingRow.status !== "pending") return false;

  const { data: reg, error: regErr } = await db
    .from("it_run_registrations")
    .select("id, final_price, amount_paid_paise, registration_status, category_id, participant_count, coupon_id, registration_code, early_bird_offer_id")
    .eq("id", pendingRow.registration_id)
    .single<{
      id: string; final_price: number; amount_paid_paise: number | null; registration_status: string;
      category_id: string; participant_count: number; coupon_id: string | null;
      registration_code: string; early_bird_offer_id: string | null;
    }>();
  if (regErr || !reg) throw new Error(`Registration not found for refund ${refundId}`);

  // A downgrade refund moves the registration to the target category once it is processed
  const downgrade = await downgradeForRefund(db, refundId);
  let targetPrice: number | null = null;
  if (downgrade) {
    const { data: target } = await db
      .from("it_run_categories")
      .select("id, price_rupees")
      .eq("id", downgrade.targetCategoryId)
      .maybeSingle<{ id: string; price_rupees: number }>();
    if (!target) throw new Error(`Target category missing for downgrade refund ${refundId}`);
    if (reg.final_price * 100 - downgrade.amountPaise !== target.price_rupees * 100) {
      throw new Error(`Downgrade refund ${refundId} no longer matches the target price`);
    }
    targetPrice = target.price_rupees;
  }

  // Take the lock: pending -> processed exactly once.
  const { data: transitioned, error: txErr } = await db
    .from("it_run_refunds")
    .update({
      status: "processed",
      processed_at: now,
      updated_at: now,
      ...(razorpayRefundId ? { razorpay_refund_id: razorpayRefundId } : {}),
    })
    .eq("id", refundId)
    .eq("status", "pending")
    .select("id, registration_id, amount_paise")
    .maybeSingle<{ id: string; registration_id: string; amount_paise: number }>();

  if (txErr) throw new Error(`Failed to mark refund processed: ${txErr.message}`);
  if (!transitioned) return false;

  // Original amount actually paid. Refund limits are measured against this, not the current price.
  const paidPaise = paidAmountPaise(reg);
  const totalRefunded = await getRefundedAmountPaise(db, reg.id);
  const fullyRefunded = totalRefunded >= paidPaise;
  // A downgrade never refunds the whole payment (the target costs more than zero), so it cannot cancel.
  const movesCategory = downgrade !== null && targetPrice !== null && !fullyRefunded;

  const regUpdate: Record<string, unknown> = {
    payment_status: fullyRefunded ? "refunded" : "partially_refunded",
  };
  if (movesCategory) {
    regUpdate.amount_paid_paise = paidPaise;
    regUpdate.category_id = downgrade!.targetCategoryId;
    regUpdate.base_price = targetPrice;
    regUpdate.final_price = targetPrice;
    regUpdate.discount_amount = 0;
  }
  const shouldCancel = fullyRefunded && reg.registration_status !== "cancelled";
  if (shouldCancel) {
    regUpdate.registration_status = "cancelled";
    regUpdate.cancelled_reason = "Refunded";
    regUpdate.cancelled_at = now;
  }

  const { error: updErr } = await db.from("it_run_registrations").update(regUpdate).eq("id", reg.id);
  if (updErr) throw new Error(`Failed to update registration after refund: ${updErr.message}`);

  if (movesCategory) {
    // The target seats were reserved when the refund was started; the old category's seats are now free.
    await db.rpc("itr_release_capacity", {
      p_category_id: reg.category_id,
      p_count: reg.participant_count,
    });
  } else if (downgrade) {
    // Defensive: the downgrade cannot move the registration, so give back the seats reserved for it.
    await db.rpc("itr_release_capacity", {
      p_category_id: downgrade.targetCategoryId,
      p_count: reg.participant_count,
    });
  }

  if (shouldCancel) {
    await db.rpc("itr_release_capacity", {
      p_category_id: reg.category_id,
      p_count: reg.participant_count,
    });
    if (reg.early_bird_offer_id) {
      await db.rpc("itr_early_bird_release", { p_offer_id: reg.early_bird_offer_id });
    }
    if (reg.coupon_id) {
      await db.rpc("itr_release_coupon", { p_coupon_id: reg.coupon_id });
    }
  }

  // Refund request linked to this refund (if any) becomes executed.
  await db
    .from("it_run_refund_requests")
    .update({ status: "executed", updated_at: now })
    .eq("refund_id", refundId)
    .eq("status", "approved");

  await db.from("it_run_refund_audit").insert({
    event_id: await eventIdForRegistration(db, reg.id),
    refund_id: refundId,
    registration_id: reg.id,
    action: "REFUND_PROCESSED",
    details: {
      amount_paise: transitioned.amount_paise,
      razorpay_refund_id: razorpayRefundId,
      total_refunded_paise: totalRefunded,
      registration_cancelled: shouldCancel,
      actor,
    },
  });

  return true;
}

/**
 * Marks a pending refund as failed. The request stays `approved`, so an admin can retry
 * (a new refund row is created on retry; the failed row is kept for the audit trail).
 */
export async function markRefundFailed(
  db: Db,
  refundId: string,
  failureReason: string,
  actor: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("it_run_refunds")
    .update({ status: "failed", failure_reason: failureReason, updated_at: now })
    .eq("id", refundId)
    .eq("status", "pending")
    .select("id, registration_id")
    .maybeSingle<{ id: string; registration_id: string }>();

  if (error) throw new Error(`Failed to mark refund failed: ${error.message}`);
  if (!data) return false;

  // A failed downgrade refund gives back the seats it reserved in the target category.
  const downgrade = await downgradeForRefund(db, refundId);
  if (downgrade) {
    const { data: reg } = await db
      .from("it_run_registrations")
      .select("participant_count")
      .eq("id", data.registration_id)
      .maybeSingle<{ participant_count: number }>();
    if (reg) {
      await db.rpc("itr_release_capacity", {
        p_category_id: downgrade.targetCategoryId,
        p_count: reg.participant_count,
      });
    }
  }

  await db.from("it_run_refund_audit").insert({
    event_id: await eventIdForRegistration(db, data.registration_id),
    refund_id: refundId,
    registration_id: data.registration_id,
    action: "REFUND_FAILED",
    details: { failure_reason: failureReason, actor },
  });
  return true;
}

/** The amount actually paid for a registration, in paise. Before any downgrade this is final_price * 100. */
export function paidAmountPaise(reg: { final_price: number; amount_paid_paise: number | null }): number {
  return reg.amount_paid_paise ?? reg.final_price * 100;
}

export interface DowngradeForRefund {
  requestId: string;
  targetCategoryId: string;
  amountPaise: number;
}

/**
 * The downgrade request behind a refund, if the refund was started for one. Read from the refund's
 * metadata, which is written before the refund is sent, so it works even if the request was never linked.
 */
export async function downgradeForRefund(db: Db, refundId: string): Promise<DowngradeForRefund | null> {
  const { data: refund } = await db
    .from("it_run_refunds")
    .select("metadata")
    .eq("id", refundId)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();
  const requestId = typeof refund?.metadata?.request_id === "string" ? refund.metadata.request_id : null;
  if (!requestId) return null;

  const { data: request } = await db
    .from("it_run_refund_requests")
    .select("id, request_kind, target_category_id, requested_amount_paise")
    .eq("id", requestId)
    .maybeSingle<{ id: string; request_kind: string; target_category_id: string | null; requested_amount_paise: number | null }>();
  if (!request || request.request_kind !== "downgrade" || !request.target_category_id || !request.requested_amount_paise) {
    return null;
  }
  return { requestId: request.id, targetCategoryId: request.target_category_id, amountPaise: request.requested_amount_paise };
}

async function eventIdForRegistration(db: Db, registrationId: string): Promise<string> {
  const { data } = await db
    .from("it_run_registrations")
    .select("event_id")
    .eq("id", registrationId)
    .single<{ event_id: string }>();
  return data?.event_id ?? "";
}

// ── Refundable balance ──────────────────────────────────────────────────────────

export interface RefundableBreakdown {
  /** Confirmed by Razorpay (status processed). */
  refundedPaise: number;
  /** Created but not yet confirmed (pending: processing or uncertain). */
  inFlightPaise: number;
  /** Original amount paid for the registration (booking-level payment). */
  finalPricePaise: number;
  /** Still refundable: final price minus processed and in-flight refunds. Never negative. */
  remainingPaise: number;
}

/** Pure: the refundable balance of one booking-level payment, from its refund rows. */
export function computeRefundableBreakdown(
  finalPricePaise: number,
  refunds: Array<{ status: string; amount_paise: number }>,
): RefundableBreakdown {
  const refundedPaise = refunds
    .filter(r => r.status === "processed")
    .reduce((sum, r) => sum + r.amount_paise, 0);
  const inFlightPaise = refunds
    .filter(r => r.status === "pending")
    .reduce((sum, r) => sum + r.amount_paise, 0);
  return {
    refundedPaise,
    inFlightPaise,
    finalPricePaise,
    remainingPaise: Math.max(0, finalPricePaise - refundedPaise - inFlightPaise),
  };
}

// ── Reconciliation ──────────────────────────────────────────────────────────────

export type ReconcileOutcome =
  | { kind: "no_change"; reason: string }
  | { kind: "finalized_processed"; refundId: string }
  | { kind: "marked_failed"; refundId: string }
  | { kind: "still_pending"; refundId: string; reason: string };

/**
 * Reconciles one pending refund against Razorpay's own record of it.
 *  - Razorpay says processed  -> finalize (guarded; cancels only when fully refunded).
 *  - Razorpay says failed     -> mark failed (the request stays approved, so retry is possible).
 *  - Razorpay has no record   -> stays pending. It may still be in flight or the outcome is
 *                                unknown, and marking it failed could allow a duplicate refund.
 *  - Razorpay says pending    -> stays pending.
 */
export async function reconcileRefund(
  db: Db,
  refund: { id: string; status: string; razorpay_refund_id: string | null; razorpay_payment_id: string | null },
  actor: string,
): Promise<ReconcileOutcome> {
  if (refund.status !== "pending") {
    return { kind: "no_change", reason: `Refund is already ${refund.status}` };
  }
  if (!refund.razorpay_payment_id) {
    return { kind: "still_pending", refundId: refund.id, reason: "No Razorpay payment ID on record; cannot check Razorpay" };
  }

  const rzpRefunds = await listRefundsForPayment(refund.razorpay_payment_id);
  const match = rzpRefunds.find(r =>
    (refund.razorpay_refund_id && r.id === refund.razorpay_refund_id) ||
    r.notes?.refund_record === refund.id,
  );

  if (!match) {
    return {
      kind: "still_pending",
      refundId: refund.id,
      reason: "Razorpay has no refund for this attempt. It may still be in flight; re-check later. It was not marked failed, to prevent a duplicate refund.",
    };
  }

  if (match.status === "processed") {
    const finalized = await finalizeRefundProcessed(db, refund.id, match.id, actor);
    return finalized
      ? { kind: "finalized_processed", refundId: refund.id }
      : { kind: "no_change", reason: "Refund was finalized by another process" };
  }
  if (match.status === "failed") {
    const failed = await markRefundFailed(db, refund.id, "Razorpay reports the refund as failed", actor);
    return failed
      ? { kind: "marked_failed", refundId: refund.id }
      : { kind: "no_change", reason: "Refund status changed by another process" };
  }
  if (!refund.razorpay_refund_id) {
    await db.from("it_run_refunds").update({ razorpay_refund_id: match.id }).eq("id", refund.id);
  }
  return { kind: "still_pending", refundId: refund.id, reason: "Razorpay reports the refund as still pending" };
}
