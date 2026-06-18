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

  // Idempotency guard: if this razorpay_payment_id was already recorded,
  // return the stored expiry immediately without touching any data.
  const { data: alreadyProcessed } = await db
    .from("memberships")
    .select("expires_at")
    .eq("razorpay_payment_id", razorpay_payment_id)
    .maybeSingle();

  if (alreadyProcessed) {
    return NextResponse.json({ success: true, expiresAt: alreadyProcessed.expires_at });
  }

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

  // Coupon was already atomically claimed at create-order time to prevent
  // race conditions. No second redemption needed here.

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
