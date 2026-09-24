import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRazorpaySDK as getRazorpay } from "@/lib/razorpay-client";

// POST /api/it-run/payment/create-order
// Body: { registrationId }
export async function POST(req: NextRequest) {
  try {
    const { registrationId } = await req.json() as { registrationId: string };
    if (!registrationId) return NextResponse.json({ error: "registrationId required" }, { status: 400 });

    const db = getSupabaseServer();

    const { data: reg } = await db
      .from("it_run_registrations")
      .select("id,registration_code,lead_email,final_price,base_price,payment_status,razorpay_order_id,category_id,participant_count,coupon_id,discount_amount,event_id")
      .eq("id", registrationId)
      .single<{
        id: string; registration_code: string; lead_email: string;
        final_price: number; base_price: number; payment_status: string;
        razorpay_order_id: string | null;
        category_id: string; participant_count: number;
        coupon_id: string | null; discount_amount: number; event_id: string;
      }>();

    if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

    if (reg.payment_status === "paid" || reg.payment_status === "free") {
      return NextResponse.json({ error: "Already paid" }, { status: 409 });
    }
    if (reg.payment_status === "expired") {
      return NextResponse.json({ error: "Registration expired. Please register again." }, { status: 409 });
    }
    if (reg.final_price === 0) {
      return NextResponse.json({ error: "Free registration does not require payment" }, { status: 400 });
    }

    const amountPaise = reg.final_price * 100;

    // ── Retry after failure ────────────────────────────────────────────────────
    // When payment.failed fires, capacity + coupon are released immediately so
    // the slot becomes available to others. If the user retries from step 6,
    // re-acquire both before opening a new Razorpay checkout. Uses an optimistic
    // lock (eq("payment_status","failed")) so only one concurrent retry wins.
    if (reg.payment_status === "failed") {
      const { data: reserveStatus } = await db.rpc("itr_reserve_capacity", {
        p_category_id: reg.category_id,
        p_increment:   reg.participant_count,
        p_payment_ttl_mins: 15,
      });

      if (reserveStatus === "full") {
        return NextResponse.json(
          { error: "This category is now fully booked. Your slot is no longer available." },
          { status: 409 },
        );
      }
      if (reserveStatus === "unavailable") {
        return NextResponse.json({ error: "Category unavailable" }, { status: 409 });
      }

      if (reg.coupon_id && reg.discount_amount > 0) {
        const { data: couponDiscount } = await db.rpc("itr_use_coupon", {
          p_coupon_id:  reg.coupon_id,
          p_event_id:   reg.event_id,
          p_base_price: reg.base_price,
        });
        if (couponDiscount === null) {
          void db.rpc("itr_release_capacity", {
            p_category_id: reg.category_id,
            p_count: reg.participant_count,
          });
          return NextResponse.json(
            { error: "Your coupon is no longer valid. Please contact support." },
            { status: 409 },
          );
        }
      }

      // Atomic status transition: only proceed if we win the race
      const { data: transitioned } = await db
        .from("it_run_registrations")
        .update({ payment_status: "payment_attempted" })
        .eq("id", reg.id)
        .eq("payment_status", "failed")
        .select("id");

      if (!transitioned?.length) {
        // A concurrent retry already claimed the slot — release what we just reserved
        void db.rpc("itr_release_capacity", {
          p_category_id: reg.category_id, p_count: reg.participant_count,
        });
        if (reg.coupon_id && reg.discount_amount > 0) {
          void db.rpc("itr_release_coupon", { p_coupon_id: reg.coupon_id });
        }
      }

      return NextResponse.json({
        orderId:  reg.razorpay_order_id,
        amount:   amountPaise,
        currency: "INR",
        key:      process.env.RAZORPAY_KEY_ID,
      });
    }

    // ── Idempotency: Razorpay order already created ───────────────────────────
    if (reg.razorpay_order_id) {
      // Advance from pending → payment_attempted if not already there
      void db.from("it_run_registrations")
        .update({ payment_status: "payment_attempted" })
        .eq("id", registrationId)
        .eq("payment_status", "pending");

      return NextResponse.json({
        orderId:  reg.razorpay_order_id,
        amount:   amountPaise,
        currency: "INR",
        key:      process.env.RAZORPAY_KEY_ID,
      });
    }

    if (amountPaise < 100) return NextResponse.json({ error: "Amount too low" }, { status: 400 });

    // ── Create new Razorpay order ─────────────────────────────────────────────
    const order = await getRazorpay().orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt:  `itr_${reg.registration_code}_${Date.now()}`,
      notes: {
        email:           reg.lead_email,
        it_run_reg_id:   reg.id,
        it_run_reg_code: reg.registration_code,
        type:            "it_run",
      },
    });

    await db
      .from("it_run_registrations")
      .update({ razorpay_order_id: order.id, payment_status: "payment_attempted" })
      .eq("id", registrationId)
      .eq("payment_status", "pending");

    return NextResponse.json({
      orderId:  order.id,
      amount:   amountPaise,
      currency: "INR",
      key:      process.env.RAZORPAY_KEY_ID,
    });
  } catch (e: unknown) {
    console.error("[it-run/payment/create-order] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
