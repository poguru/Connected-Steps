import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { redeemCoupon } from "@/lib/coupon-redeem";

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
      .select("id, coupon_id, user_email, payment_status")
      .eq("registration_code", registration_code)
      .single();

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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Redeem coupon atomically (fire-and-forget)
    if (reg.coupon_id) {
      redeemCoupon(reg.coupon_id, reg.user_email).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
