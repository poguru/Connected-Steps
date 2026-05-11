import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, paymentEmailHTML } from "@/lib/notify";

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
  } = await req.json();

  // Verify Razorpay signature
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
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

  // Fire-and-forget confirmation email
  sendEmail(
    email.toLowerCase(),
    name || "Member",
    "Membership Confirmed – Connected Steps",
    paymentEmailHTML(name || "there", PLAN_LABELS[plan] ?? plan, amount / 100, expiresAt.toISOString())
  ).catch(console.error);

  return NextResponse.json({ success: true, expiresAt: expiresAt.toISOString() });
}
