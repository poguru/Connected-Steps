import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { redeemCoupon } from "@/lib/coupon-redeem";
import { verifyUserToken } from "@/lib/admin-auth";
import { getRazorpaySDK as getRazorpay } from "@/lib/razorpay-client";
import { applyMembershipDiscount } from "@/lib/commerce/pricing";

export async function POST(req: NextRequest) {
  const email = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan, coupon_id } = await req.json();
  if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  // Resolve plan amount from DB — source of truth for pricing.
  // price is stored in rupees; convert to paise for Razorpay.
  const db = getSupabaseServer();
  const { data: planRow } = await db
    .from("membership_plans")
    .select("price")
    .eq("razorpay_plan", plan)
    .eq("is_active", true)
    .maybeSingle();

  if (!planRow?.price) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const originalAmount = Math.round(Number(planRow.price) * 100); // rupees → paise
  let amount           = originalAmount;
  let discountApplied  = 0;

  if (coupon_id) {
    const { data: coupon } = await db
      .from("coupons")
      .select("id, discount_type, discount_value, expires_at, use_count, max_uses")
      .eq("id", coupon_id)
      .single();

    if (!coupon || coupon.use_count >= coupon.max_uses || (coupon.expires_at && new Date(coupon.expires_at) <= new Date())) {
      return NextResponse.json({ error: "This coupon is no longer valid." }, { status: 410 });
    }

    // Check if this user already has a coupon_use entry for this coupon
    // (e.g. they refreshed during checkout — avoid double-claiming).
    const { data: existingUse } = await db
      .from("coupon_uses")
      .select("id")
      .eq("coupon_id", coupon_id)
      .eq("used_by_email", email.toLowerCase())
      .maybeSingle();

    if (existingUse) {
      // Already claimed in a prior order — re-apply the discount without re-claiming.
      amount          = applyMembershipDiscount(originalAmount, coupon.discount_type, coupon.discount_value);
      discountApplied = originalAmount - amount;
    } else {
      // Atomically claim the coupon use now. This prevents two concurrent users
      // both getting a discount from the last available use of a coupon.
      const claimed = await redeemCoupon(coupon_id, email.toLowerCase());
      if (!claimed) {
        return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 410 });
      }
      amount          = applyMembershipDiscount(originalAmount, coupon.discount_type, coupon.discount_value);
      discountApplied = originalAmount - amount;
    }
  }

  let order: { id: string };
  try {
    order = await getRazorpay().orders.create({
      amount,
      currency: "INR",
      receipt:  `cs_${plan}_${Date.now()}`,
      notes:    { email, plan, coupon_id: coupon_id ?? "" },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Log the order so the daily membership reconcile can detect any payments
  // that were captured by Razorpay but never reflected in our memberships
  // table (network loss, client crash, etc.). Non-blocking: a log failure must
  // never prevent the user from reaching checkout.
  db.from("payment_order_log").insert({
    razorpay_order_id: order.id,
    user_email:        email.toLowerCase(),
    plan,
    amount_paise:      amount,
    coupon_id:         coupon_id ?? null,
  }).then(({ error: logErr }) => {
    if (logErr) console.warn("[create-order] payment_order_log write failed:", logErr.message);
  });

  return NextResponse.json({ orderId: order.id, amount, originalAmount, discountApplied, currency: "INR" });
}
