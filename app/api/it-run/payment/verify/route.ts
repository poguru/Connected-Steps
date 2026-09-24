import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyPaymentSignature } from "@/lib/razorpay-security";
import { sendItRunConfirmationEmail } from "@/lib/it-run-email";
// POST /api/it-run/payment/verify
// Called by the client after Razorpay checkout success.
// Verifies signature and confirms the registration.
export async function POST(req: NextRequest) {
  try {
    const { registrationId, paymentId, orderId, signature } = await req.json() as {
      registrationId: string; paymentId: string;
      orderId: string; signature: string;
    };

    if (!registrationId || !paymentId || !orderId || !signature) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    // Verify Razorpay signature
    let sigValid: boolean;
    try { sigValid = verifyPaymentSignature(orderId, paymentId, signature); } catch { sigValid = false; }

    if (!sigValid) {
      console.error(`[it-run/payment/verify] invalid signature payment=${paymentId}`);
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Fetch registration
    const { data: reg } = await db
      .from("it_run_registrations")
      .select("id,registration_code,lead_email,final_price,payment_status,razorpay_payment_id,razorpay_order_id")
      .eq("id", registrationId)
      .single<{
        id: string; registration_code: string; lead_email: string; final_price: number;
        payment_status: string; razorpay_payment_id: string | null;
        razorpay_order_id: string | null;
      }>();

    if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

    // Validate that the orderId in this request matches what we stored for this registration.
    // Prevents IDOR: an attacker can't confirm a different registration using a valid
    // (orderId, paymentId, signature) tuple obtained from their own payment.
    if (reg.razorpay_order_id && reg.razorpay_order_id !== orderId) {
      console.error(
        `[it-run/payment/verify] orderId mismatch reg=${reg.registration_code}` +
        ` stored=${reg.razorpay_order_id} received=${orderId}`,
      );
      return NextResponse.json({ error: "Order ID mismatch" }, { status: 400 });
    }

    // Idempotency check
    if (reg.payment_status === "paid") {
      return NextResponse.json({ ok: true, already: true });
    }

    if (reg.razorpay_payment_id === paymentId) {
      return NextResponse.json({ ok: true, already: true });
    }

    // Confirm payment — only transitions pending / payment_attempted / failed → paid.
    // Using .select("id") lets us detect when a concurrent confirm (webhook) already
    // updated this row, so we don't send a duplicate confirmation email.
    const { data: updated, error: updateErr } = await db
      .from("it_run_registrations")
      .update({
        payment_status:      "paid",
        razorpay_payment_id: paymentId,
        razorpay_order_id:   orderId,
      })
      .eq("id", registrationId)
      .in("payment_status", ["pending", "payment_attempted", "failed"])
      .select("id");

    if (updateErr) {
      console.error("[it-run/payment/verify] update error:", updateErr.message);
      return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
    }

    if (!updated?.length) {
      // A concurrent webhook already confirmed this payment — return ok without re-sending email
      console.log(`[it-run/payment/verify] 0 rows updated for ${reg.registration_code} — confirmed elsewhere`);
      return NextResponse.json({ ok: true });
    }

    console.log(`[it-run/payment/verify] Registration ${reg.registration_code} confirmed via client verify — payment ${paymentId}`);

    // Send confirmation email with per-participant QR codes (fire-and-forget)
    sendItRunConfirmationEmail(reg.id, reg.registration_code, reg.lead_email, "")
      .catch(e => console.error("[it-run/payment/verify] email error:", e));

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[it-run/payment/verify] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
