import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer }    from "@/lib/supabase-server";
import { validateRazorpayWebhook } from "@/lib/razorpay-security";
import { handleEventQrEmail,
         handleInvoiceGenerate } from "@/lib/job-handlers";
import { enqueueJob }           from "@/lib/job-queue";
import { signEventQR }          from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";
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
//           ✓ refund.created    (auto-cancel registration on external refund)
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

interface RzpRefundEntity {
  id:         string;
  payment_id: string;
  amount:     number;
  currency:   string;
  notes?:     Record<string, string>;
  receipt?:   string | null;
}

interface RzpWebhookPayload {
  entity:     string;
  account_id: string;
  event:      string;
  payload: {
    payment?: { entity: RzpPaymentEntity };
    refund?:  { entity: RzpRefundEntity };
  };
}

function reasonToMessage(reason: string | undefined): string {
  if (!reason) return "Webhook validation failed";
  if (reason.startsWith("timestamp_too_old_")) return "Webhook timestamp too old — possible replay attack";
  if (reason === "invalid_timestamp_format") return "Invalid webhook timestamp";
  if (reason.includes("signature")) return "Invalid webhook signature";
  return "Webhook validation failed";
}

export async function POST(req: NextRequest) {
  // ── 1. Read raw body (must be done before any JSON parsing) ──────────────
  const rawBody = await req.text();

  // ── 2. Validate signature + replay-attack timestamp via shared lib ────────
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET env var not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const validation = validateRazorpayWebhook(
    rawBody,
    req.headers.get("x-razorpay-signature"),
    req.headers.get("x-razorpay-timestamp"),
    webhookSecret,
    { ip: req.headers.get("x-forwarded-for") ?? "unknown" },
  );

  if (!validation.valid) {
    return NextResponse.json(
      { error: reasonToMessage(validation.reason) },
      { status: 400 },
    );
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
  const refund  = payload.payload?.refund?.entity;

  console.log(`[razorpay-webhook] event=${event} payment_id=${payment?.id ?? refund?.payment_id} order_id=${payment?.order_id}`);

  // ── 4. Route events ───────────────────────────────────────────────────────
  //
  // payment.captured  — primary success event (auto-capture ON).
  // payment.authorized — UPI/PhonePe payments reach this state BEFORE capture.
  //   If Razorpay auto-capture is enabled (default), captured fires within seconds.
  //   If NOT enabled, payments stay authorized forever and users never get confirmed.
  //   We handle BOTH so either dashboard setting works.
  // refund.created — fires when a refund is issued (from dashboard or API).
  //   We auto-cancel the registration and free the slot so it can be re-sold.
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
  } else if (event === "refund.created" && refund) {
    console.log(`[razorpay-webhook] Handling refund.created — refund_id=${refund.id} payment_id=${refund.payment_id}`);
    await handleRefundCreated(refund);
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
    .select("id, first_name, last_name, email, distance_category")
    .eq("registration_id", reg.id)
    .eq("status", "pending_payment");

  const ev = reg.events;
  const invoicePayload = {
    productType: "event" as const, userEmail: reg.user_email, userName: reg.user_name,
    productName: ev?.title ?? "Event Registration", totalPaidRupees: reg.final_price ?? 0,
    paymentId, orderId, registrationId: reg.id, eventId: reg.event_id,
    eventDate: ev?.start_date, eventVenue: ev?.location,
  };

  if (pendingParticipants && pendingParticipants.length > 0) {
    const signed = pendingParticipants.map(p => ({
      id:                p.id,
      first_name:        p.first_name as string,
      last_name:         p.last_name  as string | null,
      email:             p.email      as string | null,
      distance_category: p.distance_category as string | null,
      qr:                signEventQR(p.id, reg.event_id),
    }));

    await Promise.all(
      signed.map(({ id, qr }) =>
        db.from("event_participants")
          .update({ status: "active", qr_token: qr })
          .eq("id", id)
      )
    );

    // Sync the first participant's QR token to event_registrations for the legacy
    // check-in endpoint compatibility. The ops scan endpoint uses participant-level QRs.
    await db.from("event_registrations")
      .update({ qr_token: signed[0].qr })
      .eq("id", reg.id);

    console.log(`[razorpay-webhook] Activated ${pendingParticipants.length} participant(s) for registration ${reg.registration_code}`);

    if (signed.length > 1) {
      // Multi-participant: send one confirmation email per person, each with their own QR.
      // Mirrors the verify-payment after() block for this case.
      const subject = `Event Registration Confirmed – ${ev?.title ?? "Connected Steps Event"}`;
      for (const p of signed) {
        const pName         = [p.first_name, p.last_name].filter(Boolean).join(" ");
        const recipientEmail = p.email?.trim() || reg.user_email;
        await sendEmail(
          recipientEmail, pName, subject,
          eventRegistrationEmailHTML({
            name:             pName,
            eventTitle:       ev?.title ?? "Connected Steps Event",
            startDate:        ev?.start_date ?? "",
            startTime:        ev?.start_time ?? null,
            location:         ev?.location ?? "",
            registrationCode: reg.registration_code,
            distanceCategory: p.distance_category ?? null,
            qrToken:          p.qr,
          }),
          false, true,
        ).catch(e => console.error(`[razorpay-webhook] Multi-participant email failed for ${reg.registration_code} participant ${p.id}:`, e));
      }
      await db.from("event_registrations").update({
        confirmation_email_sent_at: new Date().toISOString(),
        email_status:               "sent",
        qr_generated_at:            new Date().toISOString(),
      }).eq("id", reg.id);

      await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${paymentId}` });
      await handleInvoiceGenerate(invoicePayload).catch(e => console.error(`[razorpay-webhook] Invoice failed for ${reg.registration_code}:`, e));
      return;
    }
  }

  // Single-participant path: use the job-handler which handles QR generation + idempotency.
  const qrPayload = {
    registrationId: reg.id, registrationCode: reg.registration_code,
    eventId: reg.event_id, userEmail: reg.user_email, userName: reg.user_name,
    eventTitle: ev?.title ?? "Connected Steps Event", startDate: ev?.start_date ?? "",
    startTime: ev?.start_time ?? null, location: ev?.location ?? "",
    distanceCategory: reg.distance_category,
  };

  await enqueueJob("event_qr_email",   qrPayload,      { idempotencyKey: `event_qr_email:${reg.id}`,     priority: 10 });
  await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${paymentId}` });
  await handleEventQrEmail(qrPayload).catch(e => console.error(`[razorpay-webhook] QR email failed for ${reg.registration_code}:`, e));
  await handleInvoiceGenerate(invoicePayload).catch(e => console.error(`[razorpay-webhook] Invoice failed for ${reg.registration_code}:`, e));
}

// ── H18: Handle external Razorpay refunds ────────────────────────────────────
// When a refund is issued from the Razorpay dashboard or API (without going
// through our cancellation flow), this handler auto-cancels the registration
// and frees the slot. Without this, the slot stays occupied and the participant
// can still check in despite having been refunded.
async function handleRefundCreated(refund: RzpRefundEntity): Promise<void> {
  const { id: refundId, payment_id: paymentId, amount: refundAmountPaise } = refund;
  const db = getSupabaseServer();
  const label = `[razorpay-webhook/refund]`;

  // Look up the registration by razorpay_payment_id
  const { data: reg } = await db
    .from("event_registrations")
    .select("id, registration_code, status, payment_status, event_id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle<{
      id:                string;
      registration_code: string;
      status:            string;
      payment_status:    string;
      event_id:          string;
    }>();

  if (!reg) {
    // Could be a membership or IT Run payment — just log and return
    console.log(`${label} No event registration found for payment_id=${paymentId} — may be membership/it-run, skipping`);
    return;
  }

  if (reg.status === "cancelled") {
    // Already cancelled (e.g. our own cancel flow ran first) — just record refund details
    console.log(`${label} Registration ${reg.registration_code} already cancelled — updating refund fields only`);
    await db.from("event_registrations").update({
      refund_status:  "processed",
      refund_id:      refundId,
      refund_amount:  refundAmountPaise,
      refunded_at:    new Date().toISOString(),
    }).eq("id", reg.id);
    return;
  }

  const now = new Date().toISOString();

  // Cancel the registration
  const { error: cancelErr } = await db.from("event_registrations").update({
    status:              "cancelled",
    cancelled_at:        now,
    cancelled_by:        "razorpay_webhook",
    cancellation_reason: `Refund issued via Razorpay (refund_id=${refundId})`,
    refund_status:       "processed",
    refund_id:           refundId,
    refund_amount:       refundAmountPaise,
    refunded_at:         now,
  })
    .eq("id", reg.id)
    .neq("status", "cancelled"); // optimistic lock — skip if already cancelled

  if (cancelErr) {
    console.error(`${label} Failed to cancel registration ${reg.registration_code}:`, cancelErr.message);
    return;
  }

  // Invalidate participant QR tokens
  await db.from("event_participants")
    .update({ status: "cancelled" })
    .eq("registration_id", reg.id);

  // Audit log
  void db.from("cancellation_audit_log").insert({
    event_id:          reg.event_id,
    registration_id:   reg.id,
    registration_code: reg.registration_code,
    action:            "cancelled",
    actor:             "razorpay_webhook",
    actor_type:        "system",
    payload: {
      reason:    "external_refund",
      refund_id: refundId,
      payment_id: paymentId,
      refund_amount_paise: refundAmountPaise,
    },
  });

  console.log(`${label} ✅ Registration ${reg.registration_code} auto-cancelled due to external refund — refund_id=${refundId}`);
}
