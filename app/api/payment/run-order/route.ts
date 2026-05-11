import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const RUN_FEE_PAISE = 19900; // ₹199

export async function POST(req: NextRequest) {
  try {
    const { email, event_date } = await req.json();
    if (!email || !event_date)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const order = await razorpay.orders.create({
      amount:   RUN_FEE_PAISE,
      currency: "INR",
      receipt:  `run_${event_date}_${Date.now()}`,
      notes:    { email, event_date },
    });

    return NextResponse.json({ orderId: order.id, amount: RUN_FEE_PAISE, currency: "INR" });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
