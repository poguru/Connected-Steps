import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer }    from "@/lib/supabase-server";
import { handleEventQrEmail,
         handleInvoiceGenerate } from "@/lib/job-handlers";
import { enqueueJob }           from "@/lib/job-queue";
import { signEventQR }          from "@/lib/event-qr";
import { activateMembership }   from "@/lib/membership-activate";
import { sendItRunConfirmationEmail } from "@/lib/it-run-email";

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
  id:                 string;
  order_id:           string;
  amount:             number;
  currency:           string;
  status:             string;
  method:             string;
  captured:           boolean;
  notes:              Record<string, string>;
  email?:             string;
  contact?:           string;
  error_description?: string;
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

  // ── 4. Route events ───────────────────────────────────────────────────────
  //
  // payment.captured  — primary success event (auto-capture ON).
  // payment.authorized — UPI/PhonePe payments reach this state BEFORE capture.
  //   If Razorpay auto-capture is enabled (default), captured fires within seconds.
  //   If NOT enabled, payments stay authorized forever and users never get confirmed.
  //   We handle BOTH so either dashboard setting works.
  // order.paid — fires when the order amount is fully paid. Redundant with captured
  //   but useful as an extra safety net.
  if (event === "payment.captured" && payment) {
    console.log(`[razorpay-webhook] Handling payment.captured — payment_id=${payment.id}`);
    await handlePaymentCaptured(payment);
  } else if (event === "payment.authorized" && payment) {
    // UPI (PhonePe / GPay / Paytm) payments arrive here first.
    // If auto-capture is enabled, captured fires within milliseconds.
    // We still process it here so registrations are confirmed even if
    // capture is delayed or disabled.
    console.log(`[razorpay-webhook] Handling payment.authorized — payment_id=${payment.id} (UPI/pre-capture)`);
    await handlePaymentCaptured(payment);
  } else if (event === "payment.failed" && payment) {
    console.warn(`[razorpay-webhook] Payment failed — payment_id=${payment.id} order_id=${payment.order_id} error=${payment.error_description ?? "unknown"}`);
    // Mark the registration's payment as failed so admin can see it
    const db2 = getSupabaseServer();
    await db2
      .from("event_registrations")
      .update({ payment_status: "failed" })
      .eq("razorpay_order_id", payment.order_id ?? "")
      .eq("payment_status", "pending");
  } else {
    console.log(`[razorpay-webhook] Unhandled event=${event} — no action taken`);
  }

  // Razorpay expects 200 quickly; all heavy work is done via job queue
  return NextResponse.json({ ok: true });
}

async function handlePaymentCaptured(payment: RzpPaymentEntity): Promise<void> {
  const { id: paymentId, order_id: orderId, amount } = payment;
  const db = getSupabaseServer();

  // ── IT Run Sprint-2 payment (notes.type === "it_run") ─────────────────────
  if (payment.notes?.type === "it_run" || payment.notes?.it_run_reg_id) {
    await handleItRunPaymentCaptured(db, payment, paymentId, orderId ?? "");
    return;
  }

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
    // Fallback 1: look up by email stored in payment notes (set at order creation)
    // This handles the case where razorpay_order_id was not saved to the registration.
    const emailFromNotes = payment.notes?.email ?? payment.email ?? "";
    if (emailFromNotes) {
      const { data: regByEmail } = await db
        .from("event_registrations")
        .select(`id, registration_code, user_email, user_name, event_id, distance_category, final_price, payment_status, razorpay_payment_id, events ( title, start_date, start_time, location )`)
        .eq("user_email", emailFromNotes.toLowerCase())
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          id: string; registration_code: string; user_email: string; user_name: string;
          event_id: string; distance_category: string | null; final_price: number | null;
          payment_status: string; razorpay_payment_id: string | null;
          events: { title: string; start_date: string; start_time: string | null; location: string } | null;
        }>();

      if (regByEmail) {
        console.warn(`[razorpay-webhook] Found registration by email fallback for order_id=${orderId} email=${emailFromNotes} — order_id link was missing`);
        // Repair the order_id link so future lookups work
        await db.from("event_registrations").update({ razorpay_order_id: orderId }).eq("id", regByEmail.id);
        // Continue processing with this registration
        return handlePaymentCapturedForReg(db, regByEmail, paymentId, orderId);
      }
    }

    // No event registration → check if this is a membership payment.
    // notes.plan is set by /api/payment/create-order for all membership orders.
    const membershipPlan  = payment.notes?.plan;
    const membershipEmail = (payment.notes?.email ?? payment.email ?? emailFromNotes ?? "").toLowerCase();

    if (membershipPlan && membershipEmail) {
      console.log(
        `[razorpay-webhook] No event registration — attempting membership activation` +
        ` plan=${membershipPlan} email=${membershipEmail} payment=${payment.id}`
      );
      const result = await activateMembership({
        paymentId:   payment.id,
        orderId:     orderId ?? "",
        email:       membershipEmail,
        planKey:     membershipPlan,
        amountPaise: payment.amount,
        logLabel:    "razorpay-webhook",
      });
      console.log(`[razorpay-webhook] membership activation result=${result} payment=${payment.id}`);
    } else {
      console.log(
        `[razorpay-webhook] Unrecognised payment — no event registration and no membership notes` +
        ` order=${orderId} email=${emailFromNotes || "unknown"}`
      );
    }
    return;
  }

  void amount; // suppress unused var warning (amount logged in the webhook event above)

  // Process the found registration (shared between primary and fallback paths)
  return handlePaymentCapturedForReg(db, reg, paymentId, orderId);
}

async function handleItRunPaymentCaptured(
  db:        ReturnType<typeof getSupabaseServer>,
  payment:   RzpPaymentEntity,
  paymentId: string,
  orderId:   string,
): Promise<void> {
  const regId   = payment.notes?.it_run_reg_id   ?? "";
  const regCode = payment.notes?.it_run_reg_code ?? "";
  const label   = `[razorpay-webhook/it-run] reg=${regCode || regId}`;

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, registration_code, lead_email, final_price, payment_status, razorpay_payment_id, qr_token")
    .eq("razorpay_order_id", orderId)
    .maybeSingle<{ id: string; registration_code: string; lead_email: string; final_price: number; payment_status: string; razorpay_payment_id: string | null; qr_token: string | null }>();

  if (!reg) {
    console.warn(`${label} Order not found by order_id=${orderId} — skipping`);
    return;
  }

  if (reg.payment_status === "paid") {
    console.log(`${label} Already paid — skipping`);
    return;
  }
  if (reg.razorpay_payment_id === paymentId) {
    console.log(`${label} Payment ${paymentId} already processed — skipping`);
    return;
  }

  const { error } = await db
    .from("it_run_registrations")
    .update({ payment_status: "paid", razorpay_payment_id: paymentId, razorpay_order_id: orderId })
    .eq("id", reg.id)
    .in("payment_status", ["pending", "failed"]);

  if (error) {
    if (error.code === "23505") { console.log(`${label} Duplicate payment_id — already handled`); return; }
    console.error(`${label} DB update failed:`, error.message);
    return;
  }

  console.log(`${label} Payment confirmed via webhook — payment ${paymentId}`);

  sendItRunConfirmationEmail(reg.id, reg.registration_code, reg.lead_email, reg.qr_token ?? "")
    .catch(e => console.error(`${label} Confirmation email failed:`, e));
}

type RegRow = {
  id: string; registration_code: string; user_email: string; user_name: string;
  event_id: string; distance_category: string | null; final_price: number | null;
  payment_status: string; razorpay_payment_id: string | null;
  events: { title: string; start_date: string; start_time: string | null; location: string } | null;
};

async function handlePaymentCapturedForReg(
  db:        ReturnType<typeof getSupabaseServer>,
  reg:       RegRow,
  paymentId: string,
  orderId:   string,
): Promise<void> {
  if (reg.payment_status === "paid") {
    console.log(`[razorpay-webhook] Registration ${reg.registration_code} already paid — skipping`);
    return;
  }
  if (reg.razorpay_payment_id === paymentId) {
    console.log(`[razorpay-webhook] Payment ${paymentId} already processed for ${reg.registration_code} — skipping`);
    return;
  }

  const { error: updateErr } = await db
    .from("event_registrations")
    .update({ payment_status: "paid", status: "confirmed", razorpay_payment_id: paymentId, razorpay_order_id: orderId })
    .eq("id", reg.id)
    .in("payment_status", ["pending", "failed"]); // also recover failed payments

  if (updateErr) {
    if (updateErr.code === "23505") { console.log(`[razorpay-webhook] Duplicate payment_id ${paymentId} — already handled`); return; }
    console.error(`[razorpay-webhook] DB update failed for ${reg.registration_code}:`, updateErr.message);
    return;
  }

  console.log(`[razorpay-webhook] ✅ Registration ${reg.registration_code} confirmed via webhook — payment ${paymentId}`);

  // Activate event_participants rows that are still in pending_payment state.
  // The client-side verify-payment route does this, but the webhook is the server-side
  // fallback and must mirror that work so the ops scan route sees them as valid.
  const { data: pendingParticipants } = await db
    .from("event_participants")
    .select("id")
    .eq("registration_id", reg.id)
    .eq("status", "pending_payment");

  if (pendingParticipants && pendingParticipants.length > 0) {
    await Promise.all(
      pendingParticipants.map(p => {
        const qr = signEventQR(p.id, reg.event_id);
        return db.from("event_participants")
          .update({ status: "active", qr_token: qr })
          .eq("id", p.id);
      })
    );
    console.log(`[razorpay-webhook] Activated ${pendingParticipants.length} participant(s) for registration ${reg.registration_code}`);
  }

  const ev = reg.events;
  const qrPayload = {
    registrationId: reg.id, registrationCode: reg.registration_code,
    eventId: reg.event_id, userEmail: reg.user_email, userName: reg.user_name,
    eventTitle: ev?.title ?? "Connected Steps Event", startDate: ev?.start_date ?? "",
    startTime: ev?.start_time ?? null, location: ev?.location ?? "",
    distanceCategory: reg.distance_category,
  };
  const invoicePayload = {
    productType: "event" as const, userEmail: reg.user_email, userName: reg.user_name,
    productName: ev?.title ?? "Event Registration", totalPaidRupees: reg.final_price ?? 0,
    paymentId, orderId, registrationId: reg.id, eventId: reg.event_id,
    eventDate: ev?.start_date, eventVenue: ev?.location,
  };

  await enqueueJob("event_qr_email",   qrPayload,      { idempotencyKey: `event_qr_email:${reg.id}`,     priority: 10 });
  await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${paymentId}` });
  await handleEventQrEmail(qrPayload).catch(e => console.error(`[razorpay-webhook] QR email failed for ${reg.registration_code}:`, e));
  await handleInvoiceGenerate(invoicePayload).catch(e => console.error(`[razorpay-webhook] Invoice failed for ${reg.registration_code}:`, e));
}
