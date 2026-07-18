import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getSupabaseServer } from "@/lib/supabase-server";

function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

// POST /api/it-run/payment/create-order
// Body: { registrationId }
export async function POST(req: NextRequest) {
  try {
    const { registrationId } = await req.json() as { registrationId: string };
    if (!registrationId) return NextResponse.json({ error: "registrationId required" }, { status: 400 });

    const db = getSupabaseServer();

    const { data: reg } = await db
      .from("it_run_registrations")
      .select("id,registration_code,lead_email,final_price,payment_status,razorpay_order_id")
      .eq("id", registrationId)
      .single();

    if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    if (reg.payment_status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 409 });
    if (reg.final_price === 0) return NextResponse.json({ error: "Free registration does not require payment" }, { status: 400 });

    // Reuse existing order if already created (idempotency)
    if (reg.razorpay_order_id) {
      return NextResponse.json({
        orderId:  reg.razorpay_order_id,
        amount:   reg.final_price * 100,
        currency: "INR",
        key:      process.env.RAZORPAY_KEY_ID,
      });
    }

    const amountPaise = reg.final_price * 100;
    if (amountPaise < 100) return NextResponse.json({ error: "Amount too low" }, { status: 400 });

    const order = await getRazorpay().orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt:  `itr_${reg.registration_code}_${Date.now()}`,
      notes: {
        email:            reg.lead_email,
        it_run_reg_id:    reg.id,
        it_run_reg_code:  reg.registration_code,
        type:             "it_run",
      },
    });

    await db
      .from("it_run_registrations")
      .update({ razorpay_order_id: order.id })
      .eq("id", registrationId);

    return NextResponse.json({
      orderId:  order.id,
      amount:   amountPaise,
      currency: "INR",
      key:      process.env.RAZORPAY_KEY_ID,
    });
  } catch (e: unknown) {
    console.error("[it-run/payment/create-order] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
