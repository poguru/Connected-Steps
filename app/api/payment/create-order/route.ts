import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

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

export async function POST(req: NextRequest) {
  const { plan, email } = await req.json();

  if (!plan || !email || !PLAN_AMOUNTS[plan]) {
    return NextResponse.json({ error: "Invalid plan or missing email" }, { status: 400 });
  }

  const amount = PLAN_AMOUNTS[plan];

  try {
    const order = await getRazorpay().orders.create({
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
