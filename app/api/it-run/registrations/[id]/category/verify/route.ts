import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { verifyPaymentSignature } from "@/lib/razorpay-security";
import { getPayment } from "@/lib/razorpay-client";
import { applyPaidCategoryChange } from "@/lib/it-run-category-change";

// POST /api/it-run/registrations/[id]/category/verify
// Body: { changeId, orderId, paymentId, signature }
// The category changes only after: the signature is valid, the order is this change's order, Razorpay
// reports the payment captured for exactly the agreed difference. Repeating the call is safe.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) return NextResponse.json({ error: "Please sign in.", code: "AUTH_REQUIRED" }, { status: 401 });

  let body: { changeId?: string; orderId?: string; paymentId?: string; signature?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request.", code: "INVALID_REQUEST" }, { status: 400 }); }
  const { changeId, orderId, paymentId, signature } = body;
  if (!changeId || !orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "Payment details are missing.", code: "INVALID_REQUEST" }, { status: 400 });
  }

  let sigValid = false;
  try { sigValid = verifyPaymentSignature(orderId, paymentId, signature); } catch { sigValid = false; }
  if (!sigValid) return NextResponse.json({ error: "The payment could not be verified.", code: "INVALID_SIGNATURE" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, registration_code, category_id, participant_count, linked_user_email, payment_status")
    .eq("id", id)
    .maybeSingle<{ id: string; registration_code: string; category_id: string; participant_count: number; linked_user_email: string | null; payment_status: string }>();
  if (!reg || !reg.linked_user_email || reg.linked_user_email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "We couldn't find this registration.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: change } = await db
    .from("it_run_category_changes")
    .select("id, registration_id, from_category_id, to_category_id, amount_paise, razorpay_order_id, status")
    .eq("id", changeId)
    .eq("registration_id", reg.id)
    .maybeSingle<{ id: string; from_category_id: string; to_category_id: string; amount_paise: number; razorpay_order_id: string | null; status: string }>();
  if (!change || change.razorpay_order_id !== orderId) {
    return NextResponse.json({ error: "This payment does not match a category change.", code: "CHANGE_MISMATCH" }, { status: 409 });
  }

  // Already applied (repeat call or a double submit): report success without changing anything
  if (change.status === "paid") {
    return NextResponse.json({ ok: true, alreadyApplied: true });
  }
  if (change.status !== "pending") {
    // The hold lapsed (or was cancelled) while the customer was paying. If Razorpay captured the money,
    // record it for admin review instead of dropping it.
    const late = await getPayment(paymentId).catch(() => null);
    if (late && late.order_id === orderId && late.captured) {
      await db.from("it_run_audit_logs").insert({
        actor_email: email.toLowerCase(), actor_role: "participant", action: "category_change_paid_after_expiry",
        entity_type: "registration", entity_id: reg.id,
        detail: { change_id: change.id, payment_id: paymentId, amount_paise: late.amount },
      }).then(() => {}, () => {});
      return NextResponse.json({ error: `Your payment was received after the change window closed. Email info@connectedsteps.in with your payment ID so we can resolve it.`, code: "NEEDS_REVIEW" }, { status: 409 });
    }
    return NextResponse.json({ error: "This category change has expired. Please start it again.", code: "CHANGE_CLOSED" }, { status: 409 });
  }

  // Confirm with Razorpay: captured, for this order, for exactly the agreed amount
  const payment = await getPayment(paymentId).catch(() => null);
  if (!payment || payment.order_id !== orderId || !payment.captured || payment.amount !== change.amount_paise) {
    return NextResponse.json({ error: "We are still confirming your payment. Please wait a moment and refresh.", code: "PAYMENT_PENDING" }, { status: 409 });
  }

  const result = await applyPaidCategoryChange(db, {
    changeId: change.id, orderId, paymentId, amountPaise: payment.amount, actor: email.toLowerCase(),
  });
  if (result.kind === "already_applied") return NextResponse.json({ ok: true, alreadyApplied: true });
  if (result.kind === "applied") return NextResponse.json({ ok: true, registrationCode: result.registrationCode });
  if (result.kind === "needs_review") {
    return NextResponse.json({ error: "Your payment was received, but the category change needs a manual check. Email info@connectedsteps.in with your payment ID.", code: "NEEDS_REVIEW" }, { status: 409 });
  }
  return NextResponse.json({ error: "This category change could not be applied. Email info@connectedsteps.in with your payment ID.", code: "CHANGE_CLOSED" }, { status: 409 });
}
