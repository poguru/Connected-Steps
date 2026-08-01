import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyPaymentSignature } from "@/lib/razorpay-security";
import { redeemCoupon } from "@/lib/coupon-redeem";
import { enqueueJob } from "@/lib/job-queue";
import { handleEventQrEmail, handleInvoiceGenerate } from "@/lib/job-handlers";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";
import { logger } from "@/lib/logger";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatch";
import { evaluateAutomations } from "@/lib/automation-engine";

// POST /api/events/verify-payment
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, registration_code }
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      registration_code,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !registration_code) {
      return NextResponse.json({ error: "Missing payment fields." }, { status: 400 });
    }

    const ctx = { orderId: razorpay_order_id, paymentId: razorpay_payment_id, regCode: registration_code, ip };

    // Verify HMAC-SHA256(order_id|payment_id, key_secret)
    let sigValid: boolean;
    try {
      sigValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    } catch {
      logger.error("verify-payment", "RAZORPAY_KEY_SECRET not configured", ctx);
      return NextResponse.json({ error: "Payment verification unavailable." }, { status: 503 });
    }
    if (!sigValid) {
      logger.warn("verify-payment", "Invalid payment signature — possible tampering", ctx);
      return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Idempotency guard
    const { data: reg } = await db
      .from("event_registrations")
      .select("id, coupon_id, user_email, user_name, payment_status, event_id, distance_category, final_price, participant_count, events(title, start_date, start_time, location)")
      .eq("registration_code", registration_code)
      .single<{
        id: string;
        coupon_id: string | null;
        user_email: string;
        user_name: string;
        payment_status: string;
        event_id: string;
        distance_category: string | null;
        final_price: number | null;
        participant_count: number;
        events: { title: string; start_date: string; start_time: string | null; location: string } | null;
      }>();

    if (!reg) {
      logger.warn("verify-payment", "Registration not found", ctx);
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }
    if (reg.payment_status === "paid") {
      logger.info("verify-payment", "Idempotent success — already paid", { ...ctx, regId: reg.id });
      return NextResponse.json({ success: true });
    }

    // Idempotency: check if this razorpay_payment_id was already processed for
    // ANY registration (covers webhook retries and concurrent double-submissions).
    const { data: dupPayment } = await db
      .from("event_registrations")
      .select("id")
      .eq("razorpay_payment_id", razorpay_payment_id)
      .maybeSingle();
    if (dupPayment) {
      logger.info("verify-payment", "Idempotent success — payment_id already recorded", { ...ctx, regId: reg.id });
      return NextResponse.json({ success: true });
    }

    // Update registration to paid.
    // The DB BEFORE trigger (check_event_capacity) enforces the slot limit here
    // with a FOR UPDATE lock -- fully atomic against concurrent confirmations.
    // The UNIQUE index on razorpay_payment_id catches concurrent duplicate calls
    // (code 23505 --> treated as idempotent success).
    const { error } = await db
      .from("event_registrations")
      .update({
        payment_status:       "paid",
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        status:               "confirmed",
      })
      .eq("registration_code", registration_code);

    if (error) {
      // Unique violation on razorpay_payment_id = concurrent duplicate submission
      if (error.code === "23505") {
        logger.info("verify-payment", "Concurrent duplicate submission — idempotent success", { ...ctx, regId: reg.id });
        return NextResponse.json({ success: true });
      }

      // DB trigger: event reached capacity between slot reservation and confirmation
      const isFullBooked = error.message?.includes("fully booked")
        || error.message?.includes("P0001");
      if (isFullBooked) {
        logger.warn("verify-payment", "Event fully booked at confirmation time", { ...ctx, regId: reg.id });
        return NextResponse.json(
          { error: "This event is now fully booked. Please contact support for a refund." },
          { status: 409 },
        );
      }

      logger.error("verify-payment", "DB update failed", { ...ctx, regId: reg.id, code: error.code });
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Redeem coupon atomically (fire-and-forget -- fast, non-critical)
    if (reg.coupon_id) {
      redeemCoupon(reg.coupon_id, reg.user_email).catch((e: unknown) =>
        logger.error("verify-payment", "Coupon redeem failed", { ...ctx, regId: reg.id, error: String(e) })
      );
    }

    const ev = reg.events;
    const isMultiParticipant = (reg.participant_count ?? 1) > 1;

    const qrPayload = {
      registrationId:   reg.id,
      registrationCode: registration_code,
      eventId:          reg.event_id,
      userEmail:        reg.user_email,
      userName:         reg.user_name,
      eventTitle:       ev?.title ?? "Connected Steps Event",
      startDate:        ev?.start_date ?? "",
      startTime:        ev?.start_time ?? null,
      location:         ev?.location ?? "",
      distanceCategory: reg.distance_category,
    };
    const invoicePayload = {
      productType:     "event" as const,
      userEmail:       reg.user_email,
      userName:        reg.user_name,
      productName:     ev?.title ?? "Event Registration",
      totalPaidRupees: reg.final_price ?? 0,
      paymentId:       razorpay_payment_id,
      orderId:         razorpay_order_id,
      registrationId:  reg.id,
      eventId:         reg.event_id,
      eventDate:       ev?.start_date,
      eventVenue:      ev?.location,
    };

    // Enqueue for durability/retry -- survives function restarts.
    // For multi-participant, enqueue the invoice but skip the single-participant
    // QR email job (multi-participant emails are handled in after() below).
    if (!isMultiParticipant) {
      await enqueueJob("event_qr_email", qrPayload, { idempotencyKey: `event_qr_email:${reg.id}`, priority: 10 });
    }
    await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${razorpay_payment_id}` });

    logger.info("verify-payment", "Payment confirmed", { ...ctx, regId: reg.id, eventId: reg.event_id, multiParticipant: isMultiParticipant });

    after(async () => {
      // Sign QR tokens for each pending participant row and update status to active.
      // For single-participant: one row, QR written to event_participants + event_registrations.
      // For multi-participant: N rows, each gets their own QR, then N confirmation emails.
      try {
        const { data: pendingParticipants } = await getSupabaseServer()
          .from("event_participants")
          .select("id, first_name, last_name, distance_category, status")
          .eq("registration_id", reg.id)
          .is("qr_token", null);

        if (pendingParticipants && pendingParticipants.length > 0) {
          const db2 = getSupabaseServer();
          const signed: Array<{ id: string; first_name: string; last_name: string | null; qr_token: string; distance_category: string | null }> = [];
          for (const p of pendingParticipants) {
            const qr = signEventQR(p.id, reg.event_id);
            await db2.from("event_participants").update({ qr_token: qr, status: "active" }).eq("id", p.id);
            signed.push({ id: p.id, first_name: p.first_name, last_name: p.last_name, qr_token: qr, distance_category: p.distance_category });
          }

          if (isMultiParticipant) {
            for (const p of signed) {
              const pName = [p.first_name, p.last_name].filter(Boolean).join(" ");
              await sendEmail(
                reg.user_email, pName,
                `Event Registration Confirmed - ${ev?.title ?? "Event"}`,
                eventRegistrationEmailHTML({
                  name:             pName,
                  eventTitle:       ev?.title ?? "Connected Steps Event",
                  startDate:        ev?.start_date ?? "",
                  startTime:        ev?.start_time ?? null,
                  location:         ev?.location ?? "",
                  registrationCode: registration_code,
                  distanceCategory: p.distance_category ?? null,
                  qrToken:          p.qr_token,
                }),
                false, true,
              ).catch((e: unknown) =>
                logger.error("verify-payment", "Multi-participant email failed", { ...ctx, regId: reg.id, participantId: p.id, error: String(e) })
              );
            }
            await db2.from("event_registrations").update({
              confirmation_email_sent_at: new Date().toISOString(),
              email_status:               "sent",
              qr_generated_at:            new Date().toISOString(),
            }).eq("id", reg.id);
            logger.info("verify-payment", "Multi-participant emails sent", { ...ctx, regId: reg.id, count: signed.length });
            return;
          }

          // Single-participant: write QR back to event_registrations so the
          // existing handleEventQrEmail job handler can pick it up.
          if (signed[0]) {
            await db2.from("event_registrations")
              .update({ qr_token: signed[0].qr_token, qr_generated_at: new Date().toISOString() })
              .eq("id", reg.id);
          }
        }
      } catch (e) {
        logger.error("verify-payment", "Participant QR generation error", { ...ctx, regId: reg.id, error: String(e) });
      }

      // Single-participant QR email (via job handler for idempotency + retry)
      if (!isMultiParticipant) {
        try {
          await handleEventQrEmail(qrPayload);
          logger.info("verify-payment", "QR email sent", { ...ctx, regId: reg.id });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error("verify-payment", "QR email failed", { ...ctx, regId: reg.id, error: msg });
          try {
            await getSupabaseServer()
              .from("event_registrations")
              .update({ email_status: "failed" })
              .eq("id", reg.id);
          } catch { /* non-critical */ }
        }
      }

      try {
        await handleInvoiceGenerate(invoicePayload);
        logger.info("verify-payment", "Invoice generated", { ...ctx, regId: reg.id });
      } catch (e: unknown) {
        logger.error("verify-payment", "Invoice generation failed", { ...ctx, regId: reg.id, error: e instanceof Error ? e.message : String(e) });
      }

      try {
        const { data: eventOrg } = await getSupabaseServer()
          .from("events")
          .select("organization_id")
          .eq("id", reg.event_id)
          .single<{ organization_id: string }>();
        if (eventOrg?.organization_id) {
          const whCtx = {
            registration_id:     reg.id,
            event_id:            reg.event_id,
            amount_inr:          reg.final_price,
            user_email:          reg.user_email,
            razorpay_payment_id,
          };
          await dispatchWebhookEvent(eventOrg.organization_id, "payment.succeeded", whCtx);
          await evaluateAutomations(eventOrg.organization_id, "payment.succeeded", whCtx);
        }
      } catch (e: unknown) {
        logger.error("verify-payment", "Webhook dispatch failed", { ...ctx, regId: reg.id, error: String(e) });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    logger.error("verify-payment", "Unexpected error", { ip, error: String(e) });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
