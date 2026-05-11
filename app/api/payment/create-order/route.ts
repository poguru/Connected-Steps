import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Amount in paise (INR × 100)
const PLAN_AMOUNTS: Record<string, number> = {
  monthly:   120000,
  quarterly: 300000,
  biannual:  600000,
  annual:   1080000,
};

export async function POST(req: NextRequest) {
  const { plan, email } = await req.json();

  if (!plan || !email || !PLAN_AMOUNTS[plan]) {
    return NextResponse.json({ error: "Invalid plan or missing email" }, { status: 400 });
  }

  const amount = PLAN_AMOUNTS[plan];

  try {
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt:  `cs_${plan}_${Date.now()}`,
      notes:    { email, plan },
    });

    return NextResponse.json({ orderId: order.id, amount, currency: "INR" });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
