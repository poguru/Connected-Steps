import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getSupabaseServer } from "@/lib/supabase-server";
import { redeemCoupon } from "@/lib/coupon-redeem";
import { verifyUserToken } from "@/lib/admin-auth";

function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

// Amount in paise (INR × 100)
const PLAN_AMOUNTS: Record<string, number> = {
  monthly:   120000,
  quarterly: 300000,
  biannual:  600000,
  annual:   1080000,
};

function applyDiscount(amount: number, type: string, value: number): number {
  if (type === "percent") return Math.max(100, Math.round(amount * (1 - value / 100)));
  if (type === "fixed")   return Math.max(100, amount - value * 100);
  return amount;
}

export async function POST(req: NextRequest) {
  const email = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan, coupon_id } = await req.json();

  if (!plan || !PLAN_AMOUNTS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const originalAmount = PLAN_AMOUNTS[plan];
  let amount           = originalAmount;
  let discountApplied  = 0;

  if (coupon_id) {
    const db = getSupabaseServer();
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
      amount          = applyDiscount(originalAmount, coupon.discount_type, coupon.discount_value);
      discountApplied = originalAmount - amount;
    } else {
      // Atomically claim the coupon use now. This prevents two concurrent users
      // both getting a discount from the last available use of a coupon.
      const claimed = await redeemCoupon(coupon_id, email.toLowerCase());
      if (!claimed) {
        return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 410 });
      }
      amount          = applyDiscount(originalAmount, coupon.discount_type, coupon.discount_value);
      discountApplied = originalAmount - amount;
    }
  }

  try {
    const order = await getRazorpay().orders.create({
      amount,
      currency: "INR",
      receipt:  `cs_${plan}_${Date.now()}`,
      notes:    { email, plan, coupon_id: coupon_id ?? "" },
    });

    return NextResponse.json({ orderId: order.id, amount, originalAmount, discountApplied, currency: "INR" });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
