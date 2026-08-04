/**
 * Shared membership activation logic.
 *
 * Called from:
 *   - /api/webhooks/razorpay  — real-time, when Razorpay fires payment.captured
 *   - lib/membership-reconcile — daily sweep for missed activations
 *
 * NOT called from /api/payment/verify — that route has its own DB write so the
 * user gets an immediate response. This module is the RECOVERY path only.
 *
 * Idempotency: the razorpay_payment_id uniqueness check at the top of
 * activateMembership() ensures a payment is never activated twice regardless
 * of how many times the webhook or reconcile retries.
 */

import { getSupabaseServer }           from "@/lib/supabase-server";
import { enqueueJob }                  from "@/lib/job-queue";
import { handleInvoiceGenerate,
         handleMembershipEmail }       from "@/lib/job-handlers";
import { autoFeedMembershipActivated } from "@/lib/auto-feed";
import { APP_URL, SUPPORT_EMAIL } from "@/lib/config";
import { sendEmail, sendWhatsApp,
         membershipWAParams }          from "@/lib/notify";

const ADMIN_EMAIL = SUPPORT_EMAIL;

export type MembershipActivateResult =
  | "activated"       // newly activated — all side effects fired
  | "already_active"  // membership with this payment_id already exists — skipped
  | "plan_not_found"  // razorpay_plan not in membership_plans or not active
  | "amount_anomaly"  // payment amount exceeds plan ceiling — safety abort
  | "email_missing"   // email not derivable from payment notes
  | "plan_missing"    // plan key not derivable from payment notes
  | "db_error";       // upsert failed

export async function activateMembership(opts: {
  paymentId:   string;
  orderId:     string;
  email:       string;
  planKey:     string;
  amountPaise: number;
  logLabel:    string;   // logging context: "razorpay-webhook" | "membership-reconcile"
}): Promise<MembershipActivateResult> {
  const { paymentId, orderId, email, planKey, amountPaise, logLabel } = opts;

  if (!email)   return "email_missing";
  if (!planKey) return "plan_missing";

  const db = getSupabaseServer();

  // ── Idempotency guard ───────────────────────────────────────────────────────
  // The verify route and this function may race (webhook fires while client is
  // still calling verify). The payment_id check makes whichever arrives second
  // a silent no-op — no double activation, no double notification.
  const { data: existing } = await db
    .from("memberships")
    .select("user_email, expires_at")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();

  if (existing) {
    console.log(`[${logLabel}] Membership already active — payment=${paymentId} email=${email}`);
    return "already_active";
  }

  // ── Resolve plan from DB ────────────────────────────────────────────────────
  const { data: planRow } = await db
    .from("membership_plans")
    .select("price, duration_months, name")
    .eq("razorpay_plan", planKey)
    .eq("is_active", true)
    .maybeSingle();

  if (!planRow) {
    console.error(`[${logLabel}] Unknown/inactive plan="${planKey}" payment=${paymentId}`);
    return "plan_not_found";
  }

  // ── Amount ceiling check ────────────────────────────────────────────────────
  // Reject if Razorpay captured more than the plan's listed price.
  // Amounts below ceiling are valid (coupon discounts).
  const maxPaise = planRow.price ? Math.round(Number(planRow.price) * 100) : null;
  if (maxPaise && amountPaise > maxPaise) {
    console.error(`[${logLabel}] Amount anomaly payment=${paymentId} got=${amountPaise} max=${maxPaise}`);
    return "amount_anomaly";
  }

  // ── Activate membership ─────────────────────────────────────────────────────
  const months    = planRow.duration_months ?? 1;
  const startsAt  = new Date();
  const expiresAt = new Date(startsAt);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const { error: upsertErr } = await db.from("memberships").upsert(
    {
      user_email:          email,
      plan:                planKey,
      status:              "active",
      amount_paid:         amountPaise,
      currency:            "INR",
      started_at:          startsAt.toISOString(),
      expires_at:          expiresAt.toISOString(),
      razorpay_payment_id: paymentId,
      razorpay_order_id:   orderId,
    },
    { onConflict: "user_email" },
  );

  if (upsertErr) {
    console.error(`[${logLabel}] DB upsert failed payment=${paymentId}:`, upsertErr.message);
    return "db_error";
  }

  const expiryISO = expiresAt.toISOString();
  const planLabel = planRow.name ?? planKey;
  const amountINR = amountPaise / 100;

  console.log(
    `[${logLabel}] ✅ Membership activated email=${email} plan=${planLabel}` +
    ` payment=${paymentId} expires=${expiryISO.slice(0, 10)}`
  );

  // ── Mark payment_order_log row as resolved ──────────────────────────────────
  // Non-critical — if the row doesn't exist or the update fails, the reconcile
  // will see already_active on next run and clean up the stale row itself.
  try {
    await db.from("payment_order_log")
      .update({ status: "paid", resolved_at: new Date().toISOString() })
      .eq("razorpay_order_id", orderId);
  } catch { /* non-critical */ }

  // ── Fetch user profile for notifications ───────────────────────────────────
  const { data: user } = await db
    .from("users")
    .select("first_name, last_name, phone")
    .eq("email", email)
    .maybeSingle();

  const userName = user
    ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || email
    : email;

  // ── Durable job queue (survives immediate-fire failures) ───────────────────
  const invoicePayload = {
    productType:     "membership" as const,
    userEmail:       email,
    userName,
    productName:     `Membership — ${planLabel}`,
    totalPaidRupees: amountINR,
    paymentId,
    orderId,
  };
  const membershipEmailPayload = {
    userEmail:  email,
    userName,
    planLabel,
    amountINR,
    expiresAt:  expiryISO,
    paymentId,
  };

  await enqueueJob("invoice_generate", invoicePayload,       { idempotencyKey: `invoice_generate:${paymentId}` });
  await enqueueJob("membership_email", membershipEmailPayload, { idempotencyKey: `membership_email:${paymentId}`, priority: 10 });

  // ── Fire immediately — don't make the user wait for the daily cron ─────────
  await handleInvoiceGenerate(invoicePayload).catch(e =>
    console.error(`[${logLabel}] Invoice failed payment=${paymentId}:`, e)
  );
  await handleMembershipEmail(membershipEmailPayload).catch(e =>
    console.error(`[${logLabel}] Membership email failed payment=${paymentId}:`, e)
  );

  // ── WhatsApp confirmation ───────────────────────────────────────────────────
  if (user?.phone) {
    sendWhatsApp(
      user.phone,
      membershipWAParams(userName, planLabel, amountINR, expiryISO),
      "membership_confirmation",
    ).then(result => {
      const db2 = getSupabaseServer();
      void db2.from("wa_message_log").insert({
        phone:         user!.phone,
        user_email:    email,
        message_id:    result.messageId ?? null,
        template_name: "membership_confirmation",
        purpose:       "membership",
        status:        result.ok ? "sent" : "failed",
        failure_reason: result.ok ? null : (result.error ?? "unknown"),
      });
    }).catch(e => console.error(`[${logLabel}] WhatsApp failed payment=${paymentId}:`, e));
  }

  // ── Feed post ───────────────────────────────────────────────────────────────
  autoFeedMembershipActivated(email, userName, planLabel).catch(() => {});

  // ── Admin notification email ────────────────────────────────────────────────
  const appUrl = APP_URL;
  sendEmail(
    ADMIN_EMAIL,
    "Connected Steps Admin",
    `New Membership [${logLabel}] — ${planLabel} — ${userName}`,
    `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px;color:#1a1a1a">New Membership Activated</h2>
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px">Recovered via <strong>${logLabel}</strong></p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px">User</td><td style="padding:6px 0;font-weight:600">${userName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Plan</td><td style="padding:6px 0;font-weight:600">${planLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Amount</td><td style="padding:6px 0">₹${amountINR}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Expires</td><td style="padding:6px 0">${new Date(expiryISO).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Payment ID</td><td style="padding:6px 0;font-family:monospace;font-size:12px">${paymentId}</td></tr>
      </table>
      <div style="margin-top:20px">
        <a href="${appUrl}/admin/memberships" style="display:inline-block;padding:10px 20px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View in Admin →</a>
      </div>
    </body></html>`,
    false, true,
  ).catch(() => {});

  return "activated";
}
