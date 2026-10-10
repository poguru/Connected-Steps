import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyPaymentSignature } from "@/lib/razorpay-security";
import { sendItRunConfirmationEmail, sendItRunBibInviteEmail, sendItRunCheckoutConfirmationEmail } from "@/lib/it-run-email";
import { runAfterResponse } from "@/lib/after-response";
import { confirmCheckoutPayment } from "@/lib/it-run-checkout-confirm";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";

// POST /api/it-run/payment/verify
// Called by the client after Razorpay checkout success.
// Verifies signature and confirms the registration.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkAndRecordEndpointLimit(`itr:payment-verify:${ip}`, 5, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before trying again." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { registrationId, registrationIds, paymentId, orderId, signature } = await req.json() as {
      registrationId?: string; registrationIds?: string[]; paymentId: string;
      orderId: string; signature: string;
    };
    const ids = Array.isArray(registrationIds) && registrationIds.length > 0
      ? registrationIds.filter((x): x is string => typeof x === "string" && x.length > 0)
      : (registrationId ? [registrationId] : []);

    if (ids.length === 0 || !paymentId || !orderId || !signature) {
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

    // The client names every registration in this checkout. They must be exactly the ones on this order, so one
    // registration cannot be confirmed with another order's payment.
    const requested = [...new Set(ids)];
    const { data: onOrder } = await db
      .from("it_run_registrations")
      .select("id")
      .eq("razorpay_order_id", orderId)
      .returns<Array<{ id: string }>>();
    const onOrderIds = new Set((onOrder ?? []).map(r => r.id));
    const sameSet = onOrderIds.size === requested.length && requested.every(id => onOrderIds.has(id));
    if (!sameSet) {
      console.error(`[it-run/payment/verify] order/registration mismatch order=${orderId}`);
      return NextResponse.json({ error: "Order ID mismatch" }, { status: 400 });
    }

    // The order amount is ours (set when the order was made), and the signature binds this payment to that order
    const result = await confirmCheckoutPayment(db, { orderId, paymentId, capturedAmountPaise: null, actor: "client-verify" });
    if (result.kind === "not_found") return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    if (result.kind === "amount_mismatch") return NextResponse.json({ error: "Payment amount does not match" }, { status: 400 });
    if (result.kind === "already") return NextResponse.json({ ok: true, already: true });

    // Confirmation and BIB invite run after the response, so the function stays alive until they finish.
    // A failed send releases its "sent" claim, so the email can be resent from the admin portal.
    // One payment for several registrations: one combined confirmation. A single registration keeps its own email.
    if (result.registrations.length > 1) {
      const ids = result.registrations.map(r => r.id);
      runAfterResponse("checkout_confirmation", () => sendItRunCheckoutConfirmationEmail(ids));
    } else {
      for (const reg of result.registrations) {
        runAfterResponse("confirmation", () => sendItRunConfirmationEmail(reg.id, reg.registration_code, reg.lead_email, ""));
      }
    }
    // BIB invites are per registration (each has its own booking link)
    for (const reg of result.registrations) {
      runAfterResponse("bib_invite", () => sendItRunBibInviteEmail(reg.id, reg.lead_email));
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[it-run/payment/verify] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
