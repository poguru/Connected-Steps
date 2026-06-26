import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { redeemCoupon } from "@/lib/coupon-redeem";
import { enqueueJob } from "@/lib/job-queue";
import { handleEventQrEmail, handleInvoiceGenerate } from "@/lib/job-handlers";

// POST /api/events/verify-payment
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, registration_code }
export async function POST(req: NextRequest) {
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

    // Verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return NextResponse.json({ error: "Payment verification unavailable." }, { status: 503 });

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Idempotency guard
    const { data: reg } = await db
      .from("event_registrations")
      .select("id, coupon_id, user_email, user_name, payment_status, event_id, distance_category, final_price, events(title, start_date, start_time, location)")
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
        events: { title: string; start_date: string; start_time: string | null; location: string } | null;
      }>();

    if (!reg) return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    if (reg.payment_status === "paid") return NextResponse.json({ success: true });

    // Idempotency: check if this razorpay_payment_id was already processed for
    // ANY registration (covers webhook retries and concurrent double-submissions).
    const { data: dupPayment } = await db
      .from("event_registrations")
      .select("id")
      .eq("razorpay_payment_id", razorpay_payment_id)
      .maybeSingle();
    if (dupPayment) return NextResponse.json({ success: true });

    // Update registration to paid.
    // The DB BEFORE trigger (check_event_capacity) enforces the slot limit here
    // with a FOR UPDATE lock — fully atomic against concurrent confirmations.
    // The UNIQUE index on razorpay_payment_id catches concurrent duplicate calls
    // (code 23505 → treated as idempotent success).
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
      if (error.code === "23505") return NextResponse.json({ success: true });

      // DB trigger: event reached capacity between slot reservation and confirmation
      const isFullBooked = error.message?.includes("fully booked")
        || error.message?.includes("P0001");
      if (isFullBooked) {
        return NextResponse.json(
          { error: "This event is now fully booked. Please contact support for a refund." },
          { status: 409 },
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Redeem coupon atomically (fire-and-forget — fast, non-critical)
    if (reg.coupon_id) {
      redeemCoupon(reg.coupon_id, reg.user_email).catch(console.error);
    }

    const ev = reg.events;

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

    // Enqueue for durability/retry — survives function restarts.
    // Jobs are the fallback: if after() succeeds they no-op (idempotency guard).
    // If after() fails, the daily cron picks them up.
    await enqueueJob("event_qr_email",   qrPayload,      { idempotencyKey: `event_qr_email:${reg.id}`, priority: 10 });
    await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${razorpay_payment_id}` });

    // ── ROOT CAUSE FIX ────────────────────────────────────────────────────────
    // Previously: `void handleEventQrEmail(...).catch()` fired then returned the
    // response. Vercel freezes the function immediately after the response is
    // sent, killing the email BEFORE SES is called. This is why users were not
    // receiving their confirmation emails.
    //
    // Fix: next/server `after()` keeps the function alive until the callback
    // completes, even after the response has been sent to the client. This is
    // the designed Next.js solution for post-response async work.
    after(async () => {
      try {
        await handleEventQrEmail(qrPayload);
        console.log(`[verify-payment] ✅ QR email sent reg=${reg.id}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[verify-payment] ❌ QR email failed reg=${reg.id}:`, msg);
        // Record failure so admin can see and resend
        try {
          await getSupabaseServer()
            .from("event_registrations")
            .update({ email_status: "failed" })
            .eq("id", reg.id);
        } catch { /* non-critical — failure already logged */ }
      }

      try {
        await handleInvoiceGenerate(invoicePayload);
        console.log(`[verify-payment] ✅ Invoice generated reg=${reg.id}`);
      } catch (e: unknown) {
        console.error(`[verify-payment] ❌ Invoice failed reg=${reg.id}:`, e instanceof Error ? e.message : String(e));
      }
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
