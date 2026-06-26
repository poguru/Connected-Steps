import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { handleEventQrEmail, handleInvoiceGenerate } from "@/lib/job-handlers";
import { enqueueJob } from "@/lib/job-queue";

// POST /api/webhooks/razorpay
//
// Receives server-to-server payment notifications from Razorpay.
// This endpoint is the SERVER-SIDE fallback that prevents the "pending forever"
// problem caused by client-side payment verification failing (network loss,
// app crash after payment but before verify-payment is called).
//
// Setup in Razorpay Dashboard → Settings → Webhooks:
//   URL:    https://www.connectedsteps.in/api/webhooks/razorpay
//   Secret: set RAZORPAY_WEBHOOK_SECRET in Vercel env vars
//   Events: ✓ payment.captured  (mandatory)
//           ✓ payment.failed    (optional — for logging)
//
// The endpoint is idempotent — multiple deliveries of the same event are safe.

interface RzpPaymentEntity {
  id:        string;
  order_id:  string;
  amount:    number;
  currency:  string;
  status:    string;
  method:    string;
  captured:  boolean;
  notes:     Record<string, string>;
}

interface RzpWebhookPayload {
  entity:  string;
  account_id: string;
  event:   string;
  payload: {
    payment: { entity: RzpPaymentEntity };
  };
}

// Razorpay sends this header for webhook signature verification.
// The signature is HMAC-SHA256(raw_body, RAZORPAY_WEBHOOK_SECRET).
// This is different from the payment signature (which uses key_secret).
const WEBHOOK_HEADER = "x-razorpay-signature";

export async function POST(req: NextRequest) {
  // ── 1. Read raw body (must be done before any JSON parsing) ──────────────
  const rawBody = await req.text();
  const sig     = req.headers.get(WEBHOOK_HEADER) ?? "";

  // ── 2. Verify webhook signature ───────────────────────────────────────────
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET env var not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  let sigValid = false;
  try {
    sigValid = sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch { sigValid = false; }

  if (!sigValid) {
    console.error(`[razorpay-webhook] Invalid signature — received=${sig.slice(0, 10)}... expected=${expected.slice(0, 10)}...`);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // ── 3. Parse payload ──────────────────────────────────────────────────────
  let payload: RzpWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RzpWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const event   = payload.event;
  const payment = payload.payload?.payment?.entity;

  console.log(`[razorpay-webhook] event=${event} payment_id=${payment?.id} order_id=${payment?.order_id}`);

  // ── 4. Handle payment.captured (the critical event) ───────────────────────
  if (event === "payment.captured" && payment) {
    await handlePaymentCaptured(payment);
  } else if (event === "payment.failed" && payment) {
    // Log for visibility but no action needed
    console.warn(`[razorpay-webhook] Payment failed — payment_id=${payment.id} order_id=${payment.order_id}`);
  }

  // Razorpay expects 200 quickly; all heavy work is done via job queue
  return NextResponse.json({ ok: true });
}

async function handlePaymentCaptured(payment: RzpPaymentEntity): Promise<void> {
  const { id: paymentId, order_id: orderId, amount } = payment;
  const db = getSupabaseServer();

  // ── Find the pending event registration by order_id ───────────────────────
  const { data: reg } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      event_id, distance_category, final_price, payment_status, razorpay_payment_id,
      events ( title, start_date, start_time, location )
    `)
    .eq("razorpay_order_id", orderId)
    .maybeSingle<{
      id:                string;
      registration_code: string;
      user_email:        string;
      user_name:         string;
      event_id:          string;
      distance_category: string | null;
      final_price:       number | null;
      payment_status:    string;
      razorpay_payment_id: string | null;
      events:            { title: string; start_date: string; start_time: string | null; location: string } | null;
    }>();

  if (!reg) {
    // Could be a membership payment (different table) — not an error, just log it
    console.log(`[razorpay-webhook] No event registration found for order_id=${orderId} — may be membership payment`);
    return;
  }

  // Idempotency: already marked paid
  if (reg.payment_status === "paid") {
    console.log(`[razorpay-webhook] Registration ${reg.registration_code} already paid — skipping`);
    return;
  }

  // Idempotency: same payment_id already processed
  if (reg.razorpay_payment_id === paymentId) {
    console.log(`[razorpay-webhook] Payment ${paymentId} already processed for ${reg.registration_code} — skipping`);
    return;
  }

  // ── Update registration ───────────────────────────────────────────────────
  const { error: updateErr } = await db
    .from("event_registrations")
    .update({
      payment_status:      "paid",
      status:              "confirmed",
      razorpay_payment_id: paymentId,
    })
    .eq("id", reg.id)
    .eq("payment_status", "pending");  // optimistic lock

  if (updateErr) {
    // Code 23505 = duplicate payment_id — another process already did this
    if (updateErr.code === "23505") {
      console.log(`[razorpay-webhook] Duplicate payment_id ${paymentId} — already handled`);
      return;
    }
    console.error(`[razorpay-webhook] DB update failed for ${reg.registration_code}:`, updateErr.message);
    return;
  }

  console.log(`[razorpay-webhook] ✅ Registration ${reg.registration_code} confirmed via webhook — payment ${paymentId}`);

  const ev = reg.events;

  // ── Enqueue QR + invoice + email (all idempotent) ─────────────────────────
  const qrPayload = {
    registrationId:   reg.id,
    registrationCode: reg.registration_code,
    eventId:          reg.event_id,
    userEmail:        reg.user_email,
    userName:         reg.user_name,
    eventTitle:       ev?.title      ?? "Connected Steps Event",
    startDate:        ev?.start_date ?? "",
    startTime:        ev?.start_time ?? null,
    location:         ev?.location   ?? "",
    distanceCategory: reg.distance_category,
  };
  const invoicePayload = {
    productType:     "event" as const,
    userEmail:       reg.user_email,
    userName:        reg.user_name,
    productName:     ev?.title ?? "Event Registration",
    totalPaidRupees: (reg.final_price ?? 0),
    paymentId,
    orderId,
    registrationId:  reg.id,
    eventId:         reg.event_id,
    eventDate:       ev?.start_date,
    eventVenue:      ev?.location,
  };

  // Enqueue for durability (survives function restarts)
  await enqueueJob("event_qr_email",   qrPayload,      { idempotencyKey: `event_qr_email:${reg.id}`,     priority: 10 });
  await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${paymentId}` });

  // Fire immediately (webhook is called server-to-server — no Vercel freeze risk here)
  await handleEventQrEmail(qrPayload).catch(e =>
    console.error(`[razorpay-webhook] QR email failed for ${reg.registration_code}:`, e)
  );
  await handleInvoiceGenerate(invoicePayload).catch(e =>
    console.error(`[razorpay-webhook] Invoice failed for ${reg.registration_code}:`, e)
  );

  void amount; // suppress unused var warning (amount logged in the webhook event above)
}
