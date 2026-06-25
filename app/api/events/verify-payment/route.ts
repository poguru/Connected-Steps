import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { redeemCoupon } from "@/lib/coupon-redeem";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";
import { createAndSendInvoice } from "@/lib/invoice-service";

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
      .select("id, coupon_id, user_email, user_name, payment_status, event_id, distance_category, events(title, start_date, start_time, location)")
      .eq("registration_code", registration_code)
      .single<{
        id: string;
        coupon_id: string | null;
        user_email: string;
        user_name: string;
        payment_status: string;
        event_id: string;
        distance_category: string | null;
        events: { title: string; start_date: string; start_time: string | null; location: string } | null;
      }>();

    if (!reg) return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    if (reg.payment_status === "paid") return NextResponse.json({ success: true });

    // Update registration to paid
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
      const msg = error.message?.includes("fully booked")
        ? "This event is now fully booked. Please contact support for a refund."
        : error.message;
      return NextResponse.json({ error: msg }, { status: error.message?.includes("fully booked") ? 409 : 500 });
    }

    // Redeem coupon atomically (fire-and-forget)
    if (reg.coupon_id) {
      redeemCoupon(reg.coupon_id, reg.user_email).catch(console.error);
    }

    // Generate GST invoice (fire-and-forget — never blocks payment confirmation)
    const ev = reg.events;
    void createAndSendInvoice({
      userEmail:       reg.user_email,
      userName:        reg.user_name,
      productName:     ev?.title ?? "Event Registration",
      productType:     "event",
      totalPaidRupees: reg.final_price ?? 0,
      paymentId:       razorpay_payment_id,
      orderId:         razorpay_order_id,
      registrationId:  registration_code,
      eventId:         reg.event_id,
      eventDate:       ev?.start_date,
      eventVenue:      ev?.location,
    });

    // Generate QR token + send confirmation email (fire-and-forget)
    // Payment is confirmed — email failure must never affect the response.
    ;(async () => {
      try {
        const qrToken   = signEventQR(registration_code, reg.event_id);
        await db.from("event_registrations")
          .update({ qr_token: qrToken })
          .eq("registration_code", registration_code);

        const ev = reg.events;

        await sendEmail(
          reg.user_email,
          reg.user_name,
          `Event Registration Confirmed – ${ev?.title ?? "Connected Steps Event"}`,
          // isTransactional=true bypasses NON_OTP_EMAILS_DISABLED
          eventRegistrationEmailHTML({
            name:             reg.user_name,
            eventTitle:       ev?.title ?? "Connected Steps Event",
            startDate:        ev?.start_date ?? "",
            startTime:        ev?.start_time ?? null,
            location:         ev?.location ?? "",
            registrationCode: registration_code,
            distanceCategory: reg.distance_category,
            qrToken,
          }),
          false, true, // isOtp=false, isTransactional=true
        );
      } catch (e) {
        console.error("[event-verify-payment] QR/email failed (payment intact):", e);
      }
    })();

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
