import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

const DEFAULT_FEE_PAISE = 19900; // ₹199 fallback

export async function POST(req: NextRequest) {
  try {
    const { email, event_date, amount_paise } = await req.json();
    if (!email || !event_date)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const fee = (typeof amount_paise === "number" && amount_paise > 0) ? amount_paise : DEFAULT_FEE_PAISE;

    const order = await getRazorpay().orders.create({
      amount:   fee,
      currency: "INR",
      receipt:  `run_${event_date}_${Date.now()}`,
      notes:    { email, event_date },
    });

    return NextResponse.json({ orderId: order.id, amount: fee, currency: "INR" });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
