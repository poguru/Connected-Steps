import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import { createRefund } from "@/lib/razorpay-client";

type Params = { params: Promise<{ id: string; code: string }> };

// POST /api/admin/events/[id]/registrations/[code]/refund
// Body: { amount?: number (paise), mode?: "full" | "partial" | "retry" }
//
// Triggers a Razorpay refund for a cancelled, paid registration.
// amount omitted → full refund of final_price.
// mode = "retry" → retries a previously failed refund.

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId, code: registrationCode } = await params;
  const body = await req.json() as { amount?: number; mode?: "full" | "partial" | "retry" };
  const mode = body.mode ?? "full";

  const db    = getSupabaseServer();
  const actor = getAdminEmail(req) ?? "admin";

  // ── Fetch registration ───────────────────────────────────────────────────────
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, status, payment_status, razorpay_payment_id, final_price, refund_status, refund_id, user_email, user_name")
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .single();

  if (regErr || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  if (reg.status !== "cancelled") return NextResponse.json({ error: "Registration must be cancelled before refund" }, { status: 400 });
  if (reg.payment_status !== "paid") return NextResponse.json({ error: "No paid amount to refund" }, { status: 400 });
  if (!reg.razorpay_payment_id) return NextResponse.json({ error: "No Razorpay payment ID on record" }, { status: 400 });

  if (mode !== "retry" && reg.refund_status === "processed") {
    return NextResponse.json({ error: "Refund already processed" }, { status: 409 });
  }
  if (mode !== "retry" && reg.refund_status === "processing") {
    return NextResponse.json({ error: "Refund already in progress" }, { status: 409 });
  }

  // ── Determine refund amount ──────────────────────────────────────────────────
  const amountPaise = body.amount != null
    ? body.amount
    : (reg.final_price ?? 0) * 100;  // final_price is in rupees; Razorpay needs paise

  if (amountPaise <= 0) return NextResponse.json({ error: "Refund amount must be positive" }, { status: 400 });
  const maxRefundPaise = (reg.final_price ?? 0) * 100;
  if (maxRefundPaise > 0 && amountPaise > maxRefundPaise) {
    return NextResponse.json({ error: `Refund amount exceeds the original payment of ₹${reg.final_price}` }, { status: 400 });
  }

  // ── Mark as processing ───────────────────────────────────────────────────────
  await db.from("event_registrations")
    .update({ refund_status: "processing", refund_requested_by: actor, refund_requested_at: new Date().toISOString() })
    .eq("id", reg.id);

  // ── Call Razorpay ────────────────────────────────────────────────────────────
  let rzpRefund;
  try {
    rzpRefund = await createRefund(reg.razorpay_payment_id, {
      amount: amountPaise,
      speed:  "normal",
      notes:  { registration_code: registrationCode, actor, event_id: eventId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown Razorpay error";
    console.error("[refund] Razorpay error:", msg, "reg:", registrationCode);

    await db.from("event_registrations").update({
      refund_status:         "failed",
      refund_failure_reason: msg,
    }).eq("id", reg.id);

    void db.from("cancellation_audit_log").insert({
      event_id:          eventId,
      registration_id:   reg.id,
      registration_code: registrationCode,
      action:            "refund_failed",
      actor,
      actor_type:        "admin",
      payload:           { error: msg, amount_paise: amountPaise },
    });

    return NextResponse.json({ error: "Razorpay refund failed: " + msg }, { status: 502 });
  }

  // ── Update DB with refund result ─────────────────────────────────────────────
  const now          = new Date().toISOString();
  const finalStatus  = rzpRefund.status === "processed" ? "processed" : "processing";

  await db.from("event_registrations").update({
    refund_status:   finalStatus,
    refund_id:       rzpRefund.id,
    refund_amount:   rzpRefund.amount,
    refunded_at:     finalStatus === "processed" ? now : null,
  }).eq("id", reg.id);

  // ── Audit log ────────────────────────────────────────────────────────────────
  void db.from("cancellation_audit_log").insert({
    event_id:          eventId,
    registration_id:   reg.id,
    registration_code: registrationCode,
    action:            "refund_initiated",
    actor,
    actor_type:        "admin",
    payload: {
      refund_id:    rzpRefund.id,
      amount_paise: rzpRefund.amount,
      rzp_status:   rzpRefund.status,
      mode,
    },
  });

  return NextResponse.json({
    success:      true,
    refund_id:    rzpRefund.id,
    amount_paise: rzpRefund.amount,
    amount_inr:   rzpRefund.amount / 100,
    rzp_status:   rzpRefund.status,
    refund_status: finalStatus,
    message: finalStatus === "processed"
      ? "Refund processed successfully."
      : "Refund initiated — Razorpay will process it in 5–7 business days.",
  });
}
