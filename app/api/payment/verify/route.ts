import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, sendWhatsApp, paymentEmailHTML, membershipWAParams } from "@/lib/notify";
import { autoFeedMembershipActivated } from "@/lib/auto-feed";

const PLAN_MONTHS: Record<string, number> = {
  monthly:  1,
  quarterly: 3,
  biannual:  6,
  annual:   12,
};

const PLAN_LABELS: Record<string, string> = {
  monthly:  "Monthly",
  quarterly: "3 Months",
  biannual:  "6 Months",
  annual:   "12 Months",
};

export async function POST(req: NextRequest) {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    plan,
    email,
    name,
    amount,
    coupon_id,
  } = await req.json();

  // Verify Razorpay signature
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret) {
    console.error("RAZORPAY_KEY_SECRET not set — cannot verify payment signature");
    return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
  }

  const expected = crypto
    .createHmac("sha256", razorpaySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  const months    = PLAN_MONTHS[plan] ?? 1;
  const startsAt  = new Date();
  const expiresAt = new Date(startsAt);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const db = getSupabaseServer();
  const { error } = await db.from("memberships").upsert(
    {
      user_email:          email.toLowerCase(),
      plan,
      status:              "active",
      amount_paid:         amount,
      started_at:          startsAt.toISOString(),
      expires_at:          expiresAt.toISOString(),
      razorpay_payment_id,
      razorpay_order_id,
    },
    { onConflict: "user_email" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Record coupon usage (fire-and-forget — payment already succeeded)
  if (coupon_id) {
    const recordUsage = async () => {
      try {
        await db.from("coupon_uses").insert({ coupon_id, used_by_email: email.toLowerCase(), used_at: new Date().toISOString() });
      } catch {}
      try {
        const { error: rpcErr } = await db.rpc("increment_coupon_use_count", { coupon_uuid: coupon_id });
        if (rpcErr) {
          const { data: c } = await db.from("coupons").select("use_count").eq("id", coupon_id).single();
          if (c) await db.from("coupons").update({ use_count: c.use_count + 1 }).eq("id", coupon_id);
        }
      } catch {}
    };
    recordUsage().catch(console.error);
  }

  // Fetch user phone for WhatsApp
  const { data: userRow } = await db.from("users").select("phone").eq("email", email.toLowerCase()).single();
  const phone = userRow?.phone ?? null;

  const displayName  = name || "Member";
  const planLabel    = PLAN_LABELS[plan] ?? plan;
  const amountINR    = amount / 100;
  const expiryISO    = expiresAt.toISOString();

  autoFeedMembershipActivated(email.toLowerCase(), displayName, planLabel).catch(() => {});

  // Fire-and-forget: email + WhatsApp
  sendEmail(
    email.toLowerCase(),
    displayName,
    "Membership Confirmed – Connected Steps",
    paymentEmailHTML(displayName, planLabel, amountINR, expiryISO)
  ).catch(console.error);

  if (phone) {
    sendWhatsApp(
      phone,
      membershipWAParams(displayName, planLabel, amountINR, expiryISO),
      "membership_confirmation"
    ).catch(console.error);
  }

  return NextResponse.json({ success: true, expiresAt: expiryISO });
}
