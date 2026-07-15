/**
 * Membership payment reconciliation engine.
 *
 * Sweeps payment_order_log for membership orders that are still 'pending'
 * after a grace period, queries Razorpay to see if the order was actually
 * paid, and calls activateMembership() on any that were captured but never
 * reflected in our memberships table.
 *
 * This catches failures in the primary path (client crash / network loss
 * after Razorpay captured but before /api/payment/verify was called) AND
 * failures in the webhook (Razorpay could not reach our server).
 *
 * Called by /api/cron/payment-reconcile alongside event reconciliation.
 */

import { getSupabaseServer }   from "@/lib/supabase-server";
import { getCapturedPayment }  from "@/lib/razorpay-client";
import { activateMembership,
         type MembershipActivateResult } from "@/lib/membership-activate";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MembershipReconcileRow {
  razorpay_order_id: string;
  user_email:        string;
  plan:              string;
  razorpay_status:   string;
  outcome:           MembershipActivateResult | "no_payment" | "api_error";
  recovered:         boolean;
  error?:            string;
}

export interface MembershipReconcileResult {
  checked:       number;
  recovered:     number;
  still_pending: number;
  api_errors:    number;
  duration_ms:   number;
  rows:          MembershipReconcileRow[];
}

// ── Engine ────────────────────────────────────────────────────────────────────

export async function runMembershipReconciliation(opts: {
  maxBatch?:   number;
  callerLabel: string;
}): Promise<MembershipReconcileResult> {
  const { maxBatch = 5, callerLabel } = opts;
  const db      = getSupabaseServer();
  const startMs = Date.now();
  const logTag  = `${callerLabel}/membership-reconcile`;

  // Only sweep orders that are ≥30 minutes old.
  // This grace period ensures in-flight payments (user still on checkout page)
  // are never mistakenly classified as failed before the client calls verify.
  const graceCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: pendingOrders, error: fetchErr } = await db
    .from("payment_order_log")
    .select("razorpay_order_id, user_email, plan, amount_paise")
    .eq("status", "pending")
    .lt("created_at", graceCutoff)
    .order("created_at", { ascending: true })
    .limit(200);

  if (fetchErr) {
    console.error(`[${logTag}] DB fetch failed:`, fetchErr.message);
    return { checked: 0, recovered: 0, still_pending: 0, api_errors: 1, duration_ms: Date.now() - startMs, rows: [] };
  }

  const orders = pendingOrders ?? [];
  const rows: MembershipReconcileRow[] = [];
  let recovered = 0, stillPending = 0, apiErrors = 0;

  console.log(`[${logTag}] starting — ${orders.length} pending membership orders older than 30 min`);

  // ── Parallel batches (respects Razorpay rate limits) ──────────────────────
  for (let i = 0; i < orders.length; i += maxBatch) {
    const batch = orders.slice(i, i + maxBatch);

    const checks = await Promise.all(batch.map(async (order) => {
      try {
        const payment = await getCapturedPayment(order.razorpay_order_id);
        return { order, payment, apiErr: null };
      } catch (e: unknown) {
        return { order, payment: null, apiErr: e instanceof Error ? e.message : String(e) };
      }
    }));

    for (const { order, payment, apiErr } of checks) {
      const row: MembershipReconcileRow = {
        razorpay_order_id: order.razorpay_order_id,
        user_email:        order.user_email,
        plan:              order.plan,
        razorpay_status:   "unknown",
        outcome:           "no_payment",
        recovered:         false,
      };

      if (apiErr) {
        console.error(`[${logTag}] Razorpay API error order=${order.razorpay_order_id}:`, apiErr);
        row.razorpay_status = "api_error";
        row.outcome         = "api_error";
        row.error           = apiErr.slice(0, 200);
        apiErrors++;
        rows.push(row);
        continue;
      }

      if (!payment) {
        // Order exists but no captured payment → genuine abandon or still processing
        row.razorpay_status = "not_captured";
        stillPending++;
        rows.push(row);
        continue;
      }

      // Razorpay captured — check if our DB was updated
      row.razorpay_status = payment.status;

      const result = await activateMembership({
        paymentId:   payment.id,
        orderId:     order.razorpay_order_id,
        email:       order.user_email,
        planKey:     order.plan,
        amountPaise: order.amount_paise,
        logLabel:    logTag,
      });

      row.outcome   = result;
      row.recovered = result === "activated";

      if (result === "activated") {
        recovered++;
        console.log(`[${logTag}] ✅ recovered order=${order.razorpay_order_id} payment=${payment.id} email=${order.user_email}`);
      } else if (result === "already_active") {
        // Already activated (by verify or webhook) — clean up the log row
        try {
          await db.from("payment_order_log")
            .update({ status: "paid", resolved_at: new Date().toISOString() })
            .eq("razorpay_order_id", order.razorpay_order_id);
        } catch { /* non-critical */ }
        console.log(`[${logTag}] already_active — cleaned up log order=${order.razorpay_order_id}`);
      } else {
        console.error(`[${logTag}] ❌ activation failed order=${order.razorpay_order_id} result=${result}`);
        apiErrors++;
      }

      rows.push(row);
    }
  }

  const durationMs = Date.now() - startMs;
  console.log(`[${logTag}] done in ${durationMs}ms — checked=${orders.length} recovered=${recovered} pending=${stillPending} errors=${apiErrors}`);

  return {
    checked:       orders.length,
    recovered,
    still_pending: stillPending,
    api_errors:    apiErrors,
    duration_ms:   durationMs,
    rows,
  };
}
