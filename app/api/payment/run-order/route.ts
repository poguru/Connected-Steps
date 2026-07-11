import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { verifyUserToken } from "@/lib/admin-auth";

function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

const DEFAULT_FEE_PAISE = 19900; // â‚¹199 â€” server-side fallback, not caller-supplied

export async function POST(req: NextRequest) {
  try {
    // Require a valid user session
    const token = req.headers.get("x-user-token");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tokenEmail = verifyUserToken(token);
    if (!tokenEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_date } = await req.json();
    if (!event_date)
      return NextResponse.json({ error: "Missing event_date" }, { status: 400 });

    // Amount is always server-determined; callers cannot supply it
    const fee = DEFAULT_FEE_PAISE;

    const order = await getRazorpay().orders.create({
      amount:   fee,
      currency: "INR",
      receipt:  `run_${event_date}_${Date.now()}`,
      notes:    { email: tokenEmail, event_date },
    });

    return NextResponse.json({ orderId: order.id, amount: fee, currency: "INR" });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
