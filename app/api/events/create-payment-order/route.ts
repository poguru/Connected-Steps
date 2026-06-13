import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

// POST /api/events/create-payment-order
// Body: { event_id, email, registration_code }
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("x-user-token");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tokenEmail = verifyUserToken(token);
    if (!tokenEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_id, email, registration_code } = await req.json();
    if (!event_id || !email || !registration_code) {
      return NextResponse.json({ error: "event_id, email, and registration_code are required." }, { status: 400 });
    }

    if (tokenEmail.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const db = getSupabaseServer();

    // Fetch pending registration
    const { data: reg } = await db
      .from("event_registrations")
      .select("id, final_price, event_id, user_email, registration_code")
      .eq("registration_code", registration_code)
      .eq("event_id", event_id)
      .eq("user_email", email.toLowerCase().trim())
      .eq("payment_status", "pending")
      .single();

    if (!reg) {
      return NextResponse.json({ error: "Registration not found or already paid." }, { status: 404 });
    }

    // Amount in paise
    const amountPaise = reg.final_price * 100;
    if (amountPaise < 100) {
      return NextResponse.json({ error: "Amount too low for payment gateway." }, { status: 400 });
    }

    const order = await getRazorpay().orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt:  `evt_${registration_code}_${Date.now()}`,
      notes:    { email, event_id, registration_code },
    });

    // Store order ID on the registration
    await db
      .from("event_registrations")
      .update({ razorpay_order_id: order.id })
      .eq("registration_code", registration_code);

    return NextResponse.json({
      orderId:  order.id,
      amount:   amountPaise,
      currency: "INR",
      key:      process.env.RAZORPAY_KEY_ID,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
