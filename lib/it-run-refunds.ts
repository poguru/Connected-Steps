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

  // Transition pending -> processed exactly once.
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

  const { data: reg, error: regErr } = await db
    .from("it_run_registrations")
    .select("id, final_price, registration_status, category_id, participant_count, coupon_id, registration_code")
    .eq("id", transitioned.registration_id)
    .single<{
      id: string; final_price: number; registration_status: string;
      category_id: string; participant_count: number; coupon_id: string | null;
      registration_code: string;
    }>();
  if (regErr || !reg) throw new Error(`Registration not found for refund ${refundId}`);

  const totalRefunded = await getRefundedAmountPaise(db, reg.id);
  const fullyRefunded = totalRefunded >= reg.final_price;

  const regUpdate: Record<string, unknown> = {
    payment_status: fullyRefunded ? "refunded" : "partially_refunded",
  };
  const shouldCancel = fullyRefunded && reg.registration_status !== "cancelled";
  if (shouldCancel) {
    regUpdate.registration_status = "cancelled";
    regUpdate.cancelled_reason = "Refunded";
    regUpdate.cancelled_at = now;
  }

  const { error: updErr } = await db.from("it_run_registrations").update(regUpdate).eq("id", reg.id);
  if (updErr) throw new Error(`Failed to update registration after refund: ${updErr.message}`);

  if (shouldCancel) {
    await db.rpc("itr_release_capacity", {
      p_category_id: reg.category_id,
      p_count: reg.participant_count,
    });
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

  await db.from("it_run_refund_audit").insert({
    event_id: await eventIdForRegistration(db, data.registration_id),
    refund_id: refundId,
    registration_id: data.registration_id,
    action: "REFUND_FAILED",
    details: { failure_reason: failureReason, actor },
  });
  return true;
}

async function eventIdForRegistration(db: Db, registrationId: string): Promise<string> {
  const { data } = await db
    .from("it_run_registrations")
    .select("event_id")
    .eq("id", registrationId)
    .single<{ event_id: string }>();
  return data?.event_id ?? "";
}
