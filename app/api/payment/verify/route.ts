import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { sendEmail, sendWhatsApp, membershipWAParams } from "@/lib/notify";
import { autoFeedMembershipActivated } from "@/lib/auto-feed";
import { enqueueJob } from "@/lib/job-queue";
import { handleInvoiceGenerate, handleMembershipEmail } from "@/lib/job-handlers";


function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

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
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret) {
    console.error("[payment/verify] RAZORPAY_KEY_SECRET not set");
    return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
  }

  const expected = crypto
    .createHmac("sha256", razorpaySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature) {
    console.warn(`[payment/verify] Invalid signature for order ${razorpay_order_id} payment ${razorpay_payment_id}`);
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
      console.error(`[payment/verify] Order ${razorpay_order_id} not found in Razorpay`);
      return NextResponse.json({ error: "Order not found" }, { status: 400 });
    }

    // Validate order status — must be "paid" (Razorpay sets this after capture)
    if (order.status !== "paid") {
      console.warn(`[payment/verify] Order ${razorpay_order_id} status="${order.status}" — expected "paid"`);
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    verifiedAmount = order.amount;
    orderCurrency  = order.currency ?? "INR";

    // Use the plan key stored server-side in order.notes at create-order time.
    // Never trust the client-supplied plan for plan resolution — a user could send
    // plan=annual while having paid only for plan=monthly to get 12 months for free.
    canonicalPlan = order.notes?.plan || plan;
    if (order.notes?.plan && order.notes.plan !== plan) {
      console.warn(
        `[payment/verify] PLAN MISMATCH: client sent plan=${plan}, order.notes.plan=${order.notes.plan}` +
        ` — using server value — order=${razorpay_order_id}`
      );
    }

    // Cross-check email: order notes must match the authenticated user
    if (order.notes?.email && order.notes.email.toLowerCase() !== email) {
      console.warn(
        `[payment/verify] EMAIL MISMATCH: token=${email} order.notes.email=${order.notes.email}` +
        ` — order=${razorpay_order_id}`
      );
      return NextResponse.json({ error: "Payment does not match account" }, { status: 400 });
    }

    // Log if client tried to send a different amount (tampering attempt or stale UI)
    if (clientAmount !== undefined && clientAmount !== verifiedAmount) {
      console.warn(
        `[payment/verify] AMOUNT MISMATCH: client sent ${clientAmount} paise, Razorpay order has ${verifiedAmount} paise` +
        ` — email=${email} order=${razorpay_order_id} payment=${razorpay_payment_id}`
      );
    }
  } catch (fetchErr) {
    // Razorpay API unavailable — log and reject to avoid persisting unverified amounts.
    // The client can retry; the idempotency guard prevents double-processing.
    console.error(`[payment/verify] Razorpay orders.fetch failed for ${razorpay_order_id}:`, fetchErr);
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
    console.error(`[payment/verify] No active plan found for razorpay_plan=${canonicalPlan} order=${razorpay_order_id}`);
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Amount ceiling check: Razorpay amount must be > 0 and ≤ full plan price.
  // price is stored in rupees; convert to paise for comparison.
  // Amounts below the ceiling are valid (discounted via coupon).
  const maxAmount = planRow.price ? Math.round(Number(planRow.price) * 100) : null;
  if (verifiedAmount <= 0 || (maxAmount && verifiedAmount > maxAmount)) {
    console.error(`[payment/verify] AMOUNT ANOMALY: order=${razorpay_order_id} amount=${verifiedAmount} plan=${canonicalPlan} max=${maxAmount}`);
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
    console.error("[payment/verify] DB upsert error:", error.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

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
  void handleInvoiceGenerate(invoicePayload).catch(console.error);
  void handleMembershipEmail(membershipEmailPayload).catch(console.error);

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
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
