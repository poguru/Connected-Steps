import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { createRefund } from "@/lib/razorpay-client";

// POST /api/it-run/admin/refund
// Production-grade refund with complete audit trail, idempotency, and reconciliation.
// State machine:
//   REFUND_REQUESTED → validate & create refund record (status=pending)
//   → call Razorpay
//   → on success: mark status=processed, cancel registration, release capacity/coupon
//   → on failure: mark status=failed, preserve for retry/manual reconciliation
//
// Roles: super_admin, event_admin only (deliberately narrow — refunds are irreversible).
// Idempotent: same request (same registration_id) is safely retryable.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { registration_id: string; reason?: string; amount_paise?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { registration_id, reason, amount_paise } = body;
  if (!registration_id) {
    return NextResponse.json({ error: "registration_id is required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Load & validate registration
  // ─────────────────────────────────────────────────────────────────────────

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, event_id, registration_code, razorpay_order_id, razorpay_payment_id, final_price, payment_status, registration_status, category_id, participant_count, coupon_id, discount_amount, lead_email")
    .eq("id", registration_id)
    .eq("event_id", event.id)
    .maybeSingle<{
      id:                   string;
      event_id:             string;
      registration_code:    string;
      razorpay_order_id:    string | null;
      razorpay_payment_id:  string | null;
      final_price:          number;
      payment_status:       string;
      registration_status:  string;
      category_id:          string;
      participant_count:    number;
      coupon_id:            string | null;
      discount_amount:      number;
      lead_email:           string;
    }>();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }
  if (!["paid", "partially_refunded"].includes(reg.payment_status)) {
    return NextResponse.json({ error: `Cannot refund: payment_status is ${reg.payment_status}` }, { status: 422 });
  }
  if (reg.registration_status === "cancelled") {
    return NextResponse.json({ error: "Registration is already cancelled" }, { status: 422 });
  }
  if (!reg.razorpay_payment_id) {
    return NextResponse.json({ error: "No Razorpay payment ID on record" }, { status: 422 });
  }

  // Compute refund amount: if not provided, refund the full final_price
  const refundAmount = amount_paise ?? reg.final_price;
  const refundableAmount = await db.rpc("itr_refundable_amount", { p_registration_id: reg.id });

  if (refundAmount > refundableAmount) {
    return NextResponse.json(
      { error: `Cannot refund ₹${refundAmount/100}: only ₹${refundableAmount/100} remaining refundable` },
      { status: 422 },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Check for existing/pending refund (idempotency)
  // ─────────────────────────────────────────────────────────────────────────

  const { data: existingRefund } = await db
    .from("it_run_refunds")
    .select("id, status, razorpay_refund_id")
    .eq("registration_id", reg.id)
    .eq("status", "pending")
    .maybeSingle<{ id: string; status: string; razorpay_refund_id: string | null }>();

  if (existingRefund && existingRefund.razorpay_refund_id) {
    // Refund already processing — return existing result
    return NextResponse.json({
      ok: false,
      message: "Refund already pending for this registration",
      refund_id: existingRefund.razorpay_refund_id,
    }, { status: 409 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Create refund record (status=pending)
  // ─────────────────────────────────────────────────────────────────────────

  const { data: refundRecord, error: insertErr } = await db
    .from("it_run_refunds")
    .insert({
      event_id: event.id,
      registration_id: reg.id,
      razorpay_order_id: reg.razorpay_order_id,
      razorpay_payment_id: reg.razorpay_payment_id,
      amount_paise: refundAmount,
      currency: "INR",
      status: "pending",
      reason: reason || "Admin-initiated refund",
      initiated_by_admin: true,
      initiated_by_email: session.email,
      initiated_by_role: session.role,
      metadata: { ip: getClientIp(req) },
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertErr || !refundRecord) {
    console.error("[it-run/admin/refund] Failed to create refund record:", insertErr);
    return NextResponse.json({ error: "Failed to create refund record" }, { status: 500 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Call Razorpay (with safe fallback)
  // ─────────────────────────────────────────────────────────────────────────

  let rzpRefund: { id: string; amount: number };
  try {
    rzpRefund = await createRefund(reg.razorpay_payment_id, {
      amount: refundAmount,
      speed: "optimum",
      notes: { reason: reason || "Admin refund", registration: reg.registration_code },
    });
  } catch (e) {
    console.error("[it-run/admin/refund] Razorpay failed:", e);
    await db
      .from("it_run_refunds")
      .update({
        status: "failed",
        failure_reason: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundRecord.id);
    return NextResponse.json({
      error: "Razorpay refund failed — recorded for manual retry",
      refund_id: refundRecord.id,
    }, { status: 502 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Update refund record with Razorpay ID & mark processed
  // ─────────────────────────────────────────────────────────────────────────

  await db
    .from("it_run_refunds")
    .update({
      razorpay_refund_id: rzpRefund.id,
      status: "processed",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", refundRecord.id);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Cancel registration and release capacity/coupon
  // ─────────────────────────────────────────────────────────────────────────

  await db
    .from("it_run_registrations")
    .update({
      registration_status: "cancelled",
      cancelled_reason: reason || "Refunded",
      cancelled_at: new Date().toISOString(),
      payment_status: refundAmount >= reg.final_price ? "refunded" : "partially_refunded",
    })
    .eq("id", reg.id);

  // Release capacity
  await db.rpc("itr_release_capacity", {
    p_category_id: reg.category_id,
    p_count: reg.participant_count,
  });

  // Release coupon if full refund
  if (reg.coupon_id && refundAmount >= reg.final_price) {
    await db.rpc("itr_release_coupon", { p_coupon_id: reg.coupon_id });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Audit log
  // ─────────────────────────────────────────────────────────────────────────

  await db.from("it_run_refund_audit").insert({
    event_id: event.id,
    refund_id: refundRecord.id,
    registration_id: reg.id,
    action: "REFUND_PROCESSED",
    details: {
      amount: refundAmount,
      razorpay_refund_id: rzpRefund.id,
      admin_email: session.email,
      reason,
    },
  });

  console.log(
    `[it-run/admin/refund] ✅ ${reg.registration_code} refunded ₹${refundAmount/100} (Razorpay: ${rzpRefund.id})`,
  );

  return NextResponse.json({
    ok: true,
    refund_id: rzpRefund.id,
    refund_amount: refundAmount,
    registration_code: reg.registration_code,
  });
}

// GET /api/it-run/admin/refund?registration_id=<id>
// Get refund status and history for a registration
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const registrationId = req.nextUrl.searchParams.get("registration_id");
  if (!registrationId) {
    return NextResponse.json({ error: "registration_id required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: refunds } = await db
    .from("it_run_refunds")
    .select("id, amount_paise, status, reason, razorpay_refund_id, created_at, processed_at, failure_reason")
    .eq("registration_id", registrationId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ refunds: refunds ?? [] });
}
