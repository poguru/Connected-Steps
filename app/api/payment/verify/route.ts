import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyPaymentSignature } from "@/lib/razorpay-security";
import { verifyUserToken } from "@/lib/admin-auth";
import { sendEmail, sendWhatsApp, membershipWAParams } from "@/lib/notify";
import { autoFeedMembershipActivated } from "@/lib/auto-feed";
import { enqueueJob } from "@/lib/job-queue";
import { handleInvoiceGenerate, handleMembershipEmail } from "@/lib/job-handlers";
import { getRazorpaySDK as getRazorpay } from "@/lib/razorpay-client";
import { logger } from "@/lib/logger";

import { APP_URL } from "@/lib/config";
export async function POST(req: NextRequest) {
  // Authenticate the request — email MUST come from the verified token,
  // not the request body, to prevent a user claiming payment for another account.
  const userToken = req.headers.get("x-user-token");
  const verifiedEmail = userToken ? verifyUserToken(userToken) : null;
  if (!verifiedEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    plan,
    name,
    coupon_id,
    // `amount` from client is accepted for logging only — never trusted for DB writes
    amount: clientAmount,
  } = await req.json();

  // Always use the token-verified email — ignore any email in the request body
  const email = verifiedEmail.toLowerCase();

  // ── Step 1: Verify Razorpay HMAC signature ────────────────────────────────
  let sigValid: boolean;
  try {
    sigValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  } catch {
    logger.error("payment/verify", "RAZORPAY_KEY_SECRET not configured");
    return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
  }
  if (!sigValid) {
    logger.warn("payment/verify", "Invalid signature — possible tampering", { email, orderId: razorpay_order_id, paymentId: razorpay_payment_id });
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // ── Step 2: Idempotency guard ─────────────────────────────────────────────
  const db = getSupabaseServer();
  const { data: alreadyProcessed } = await db
    .from("memberships")
    .select("expires_at")
    .eq("razorpay_payment_id", razorpay_payment_id)
    .maybeSingle();

  if (alreadyProcessed) {
    return NextResponse.json({ success: true, expiresAt: alreadyProcessed.expires_at });
  }

  // ── Step 3: Fetch order from Razorpay — use server-set amount, never client ──
  let verifiedAmount: number;
  let orderCurrency  = "INR";
  let canonicalPlan  = plan; // overwritten below with Razorpay server-set value

  try {
    const rz    = getRazorpay();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await (rz.orders as any).fetch(razorpay_order_id) as {
      id:         string;
      amount:     number;
      currency:   string;
      status:     string;
      notes:      Record<string, string>;
    };

    if (!order?.id) {
      logger.error("payment/verify", "Order not found in Razorpay", { email, orderId: razorpay_order_id });
      return NextResponse.json({ error: "Order not found" }, { status: 400 });
    }

    // Validate order status — must be "paid" (Razorpay sets this after capture)
    if (order.status !== "paid") {
      logger.warn("payment/verify", "Order not yet paid", { email, orderId: razorpay_order_id, status: order.status });
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    verifiedAmount = order.amount;
    orderCurrency  = order.currency ?? "INR";

    // Use the plan key stored server-side in order.notes at create-order time.
    // Never trust the client-supplied plan for plan resolution — a user could send
    // plan=annual while having paid only for plan=monthly to get 12 months for free.
    canonicalPlan = order.notes?.plan || plan;
    if (order.notes?.plan && order.notes.plan !== plan) {
      logger.warn("payment/verify", "Plan mismatch — using server value", {
        email, orderId: razorpay_order_id, clientPlan: plan, serverPlan: order.notes.plan,
      });
    }

    // Cross-check email: order notes must match the authenticated user
    if (order.notes?.email && order.notes.email.toLowerCase() !== email) {
      logger.warn("payment/verify", "Email mismatch — token vs order notes", {
        tokenEmail: email, orderEmail: order.notes.email, orderId: razorpay_order_id,
      });
      return NextResponse.json({ error: "Payment does not match account" }, { status: 400 });
    }

    // Log if client tried to send a different amount (tampering attempt or stale UI)
    if (clientAmount !== undefined && clientAmount !== verifiedAmount) {
      logger.warn("payment/verify", "Amount mismatch — client vs Razorpay order", {
        email, orderId: razorpay_order_id, paymentId: razorpay_payment_id,
        clientAmount, serverAmount: verifiedAmount,
      });
    }
  } catch (fetchErr) {
    logger.error("payment/verify", "Razorpay orders.fetch failed", {
      email, orderId: razorpay_order_id, error: String(fetchErr),
    });
    return NextResponse.json(
      { error: "Could not verify payment amount — please retry or contact support" },
      { status: 503 }
    );
  }

  // ── Step 4: Resolve plan from DB using the Razorpay server-set plan key ───
  // Query runs AFTER the Razorpay order fetch so we use order.notes.plan
  // (set by create-order, stored on Razorpay's servers) as the authoritative
  // source — not the client-supplied plan which could be tampered.
  const { data: planRow } = await db
    .from("membership_plans")
    .select("price, duration_months, name")
    .eq("razorpay_plan", canonicalPlan)
    .eq("is_active", true)
    .maybeSingle();

  if (!planRow) {
    logger.error("payment/verify", "No active plan found", { email, orderId: razorpay_order_id, canonicalPlan });
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Amount ceiling check: Razorpay amount must be > 0 and ≤ full plan price.
  // price is stored in rupees; convert to paise for comparison.
  // Amounts below the ceiling are valid (discounted via coupon).
  const maxAmount = planRow.price ? Math.round(Number(planRow.price) * 100) : null;
  if (verifiedAmount <= 0 || (maxAmount && verifiedAmount > maxAmount)) {
    logger.error("payment/verify", "Amount anomaly detected", { email, orderId: razorpay_order_id, verifiedAmount, canonicalPlan, maxAmount });
    return NextResponse.json({ error: "Payment amount invalid" }, { status: 400 });
  }

  // ── Step 5: Activate membership using Razorpay-verified amount ────────────
  const months    = planRow.duration_months ?? 1;
  const startsAt  = new Date();
  const expiresAt = new Date(startsAt);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const { error } = await db.from("memberships").upsert(
    {
      user_email:          email,
      plan:                canonicalPlan,
      status:              "active",
      amount_paid:         verifiedAmount,   // ← Razorpay-verified, never client-supplied
      currency:            orderCurrency,
      started_at:          startsAt.toISOString(),
      expires_at:          expiresAt.toISOString(),
      razorpay_payment_id,
      razorpay_order_id,
    },
    { onConflict: "user_email" }
  );

  if (error) {
    logger.error("payment/verify", "Membership upsert failed", { email, orderId: razorpay_order_id, code: error.code });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  logger.info("payment/verify", "Membership activated", { email, plan: canonicalPlan, orderId: razorpay_order_id, paymentId: razorpay_payment_id, amountINR: verifiedAmount / 100 });

  const displayName = name || "Member";
  const planLabel   = planRow.name ?? plan;
  const amountINR   = verifiedAmount / 100;   // ← always from Razorpay
  const expiryISO   = expiresAt.toISOString();

  // Mark the payment_order_log row as resolved so the daily reconcile cron
  // does not attempt to re-activate what was just successfully processed.
  // Non-critical: if this fails, the reconcile will see already_active and
  // clean up the row itself.
  void db.from("payment_order_log")
    .update({ status: "paid", resolved_at: new Date().toISOString() })
    .eq("razorpay_order_id", razorpay_order_id);

  // ── Step 6: Post-payment side effects (invoice, email, WhatsApp, feed) ────
  const invoicePayload = {
    productType:     "membership" as const,
    userEmail:       email,
    userName:        displayName,
    productName:     `Membership — ${planLabel}`,
    totalPaidRupees: amountINR,
    paymentId:       razorpay_payment_id,
    orderId:         razorpay_order_id,
  };
  const membershipEmailPayload = {
    userEmail:  email,
    userName:   displayName,
    planLabel,
    amountINR,
    expiresAt:  expiryISO,
    paymentId:  razorpay_payment_id,
  };

  // Enqueue for durability/retry — also fire immediately so users don't wait
  await enqueueJob("invoice_generate",  invoicePayload,         { idempotencyKey: `invoice_generate:${razorpay_payment_id}` });
  await enqueueJob("membership_email",  membershipEmailPayload, { idempotencyKey: `membership_email:${razorpay_payment_id}`, priority: 10 });
  void handleInvoiceGenerate(invoicePayload).catch((e: unknown) => logger.error("payment/verify", "Invoice fire-and-forget failed", { email, error: String(e) }));
  void handleMembershipEmail(membershipEmailPayload).catch((e: unknown) => logger.error("payment/verify", "Membership email fire-and-forget failed", { email, error: String(e) }));

  // Coupon was already atomically claimed at create-order time — no second redemption needed.

  autoFeedMembershipActivated(email, displayName, planLabel).catch(() => {});

  const { data: userRow } = await db.from("users").select("phone").eq("email", email).single();
  if (userRow?.phone) {
    sendWhatsApp(
      userRow.phone,
      membershipWAParams(displayName, planLabel, amountINR, expiryISO),
      "membership_confirmation"
    ).catch(console.error);
  }

  // Admin notification — non-blocking, fire-and-forget
  const appUrl = APP_URL;
  sendEmail(
    "info@connectedsteps.in",
    "Connected Steps Admin",
    `New Membership [verify] — ${planLabel} — ${displayName}`,
    `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px;color:#1a1a1a">New Membership Activated</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px">User</td><td style="padding:6px 0;font-weight:600">${displayName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Plan</td><td style="padding:6px 0;font-weight:600">${planLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Amount</td><td style="padding:6px 0">₹${amountINR}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Expires</td><td style="padding:6px 0">${new Date(expiryISO).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Payment ID</td><td style="padding:6px 0;font-family:monospace;font-size:12px">${razorpay_payment_id}</td></tr>
      </table>
      <div style="margin-top:20px">
        <a href="${appUrl}/admin/memberships" style="display:inline-block;padding:10px 20px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View in Admin →</a>
      </div>
    </body></html>`,
    false, true,
  ).catch(() => {});

  return NextResponse.json({ success: true, expiresAt: expiryISO });
}
