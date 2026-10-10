import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRazorpaySDK as getRazorpay } from "@/lib/razorpay-client";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";
import { checkCheckoutGroup, type CheckoutRegistration } from "@/lib/it-run-checkout";

// POST /api/it-run/payment/create-order
// Body: { registrationId }
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkAndRecordEndpointLimit(`itr:payment-order:${ip}`, 5, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before trying again." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await req.json() as { registrationId?: string; registrationIds?: unknown };
    const ids = Array.isArray(body.registrationIds)
      ? body.registrationIds.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [];

    // Several registrations in one checkout: one order for their total (see lib/it-run-checkout.ts)
    if (ids.length > 1) {
      return createCheckoutGroupOrder(ids);
    }

    const registrationId = body.registrationId ?? ids[0];
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

// One Razorpay order for several registrations. Every registration gets the order id, so the confirmation
// (verify route and webhook) finds them all. Refuses the whole checkout if any registration cannot be paid.
async function createCheckoutGroupOrder(ids: string[]): Promise<NextResponse> {
  const db = getSupabaseServer();
  const { data: regs, error } = await db
    .from("it_run_registrations")
    .select("id, registration_code, event_id, lead_email, final_price, payment_status, razorpay_order_id")
    .in("id", ids)
    .returns<CheckoutRegistration[]>();
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const check = checkCheckoutGroup(ids, regs ?? []);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const key = process.env.RAZORPAY_KEY_ID;
  if (check.existingOrderId) {
    // A retry of the same checkout: reuse the order that already holds these registrations
    return NextResponse.json({ orderId: check.existingOrderId, amount: check.totalPaise, currency: "INR", key });
  }

  const lead = (regs ?? [])[0].lead_email;
  const order = await getRazorpay().orders.create({
    amount:   check.totalPaise,
    currency: "INR",
    receipt:  `itr_group_${Date.now()}`,
    notes: {
      email:          lead,
      type:           "it_run",
      it_run_reg_ids: ids.join(","),
    },
  });

  const { data: attached } = await db
    .from("it_run_registrations")
    .update({ razorpay_order_id: order.id, payment_status: "payment_attempted" })
    .in("id", ids)
    .eq("payment_status", "pending")
    .select("id");

  if ((attached ?? []).length !== ids.length) {
    // Something changed while the order was being made. Nothing was charged; the participant starts again.
    return NextResponse.json({ error: "Your registrations changed while the payment was being prepared. Please try again." }, { status: 409 });
  }

  return NextResponse.json({ orderId: order.id, amount: check.totalPaise, currency: "INR", key });
}
