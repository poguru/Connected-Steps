import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { createRefund, RazorpayApiError } from "@/lib/razorpay-client";
import { sendRefundConfirmationEmail } from "@/lib/it-run-email";
import {
  getRefundedAmountPaise,
  finalizeRefundProcessed,
  markRefundFailed,
} from "@/lib/it-run-refunds";

// POST /api/it-run/admin/refund
// Executes an APPROVED refund request. Participants can never call this.
//
// Body: { registration_id, request_id, confirm: true, amount_paise? }
//   - confirm must be exactly true (explicit admin confirmation).
//   - request_id must be an 'approved' refund request for this registration.
//   - amount_paise defaults to the remaining refundable amount.
//
// Flow:
//   1. Validate registration, payment, approved request, and remaining refundable amount.
//   2. Insert a PENDING refund row. The partial unique index allows only one pending refund
//      per registration, so duplicate clicks / concurrent admins get 409 here, before Razorpay.
//   3. Call Razorpay. Its response is the source of truth for the status:
//        - "processed" → finalize (registration cancel + capacity/coupon release only if fully refunded)
//        - "pending"   → stay pending; the refund.processed webhook finalizes it
//        - 4xx         → definitively not created → mark failed (request stays approved for retry)
//        - network/5xx → ambiguous → stays pending for reconciliation (never auto-marked failed)
//
// Roles: event_admin (super_admin bypasses role checks via requireRole).
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { registration_id?: string; request_id?: string; confirm?: unknown; amount_paise?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: "Explicit confirmation required (confirm: true)" }, { status: 400 });
  }
  const { registration_id, request_id, amount_paise } = body;
  if (!registration_id || !request_id) {
    return NextResponse.json({ error: "registration_id and request_id are required" }, { status: 400 });
  }
  if (amount_paise !== undefined && (!Number.isInteger(amount_paise) || (amount_paise as number) <= 0)) {
    return NextResponse.json({ error: "amount_paise must be a positive integer" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Step 1: registration
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, event_id, registration_code, razorpay_order_id, razorpay_payment_id, final_price, payment_status, registration_status, lead_email")
    .eq("id", registration_id)
    .eq("event_id", event.id)
    .maybeSingle<{
      id: string; event_id: string; registration_code: string;
      razorpay_order_id: string | null; razorpay_payment_id: string | null;
      final_price: number; payment_status: string; registration_status: string;
      lead_email: string;
    }>();
  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  if (reg.final_price <= 0 || reg.payment_status === "free") {
    return NextResponse.json({ error: "Free registrations cannot be refunded" }, { status: 422 });
  }
  if (!["paid", "partially_refunded"].includes(reg.payment_status)) {
    return NextResponse.json({ error: `Cannot refund: payment_status is ${reg.payment_status}` }, { status: 422 });
  }
  if (!reg.razorpay_payment_id) {
    return NextResponse.json({ error: "No Razorpay payment ID on record" }, { status: 422 });
  }

  // Step 1b: approved request for this registration
  const { data: request } = await db
    .from("it_run_refund_requests")
    .select("id, registration_id, status")
    .eq("id", request_id)
    .maybeSingle<{ id: string; registration_id: string; status: string }>();
  if (!request || request.registration_id !== reg.id) {
    return NextResponse.json({ error: "Refund request not found for this registration" }, { status: 404 });
  }
  if (request.status !== "approved") {
    return NextResponse.json({ error: `Refund request is ${request.status}; only approved requests can be executed` }, { status: 409 });
  }

  // Step 1c: remaining refundable amount (pending + processed count against the payment)
  let refunded: number;
  try {
    refunded = await getRefundedAmountPaise(db, reg.id);
  } catch (e) {
    console.error("[it-run/admin/refund] refunded-amount lookup failed:", e);
    return NextResponse.json({ error: "Failed to calculate refundable amount" }, { status: 500 });
  }
  // Refund amounts are paise; registrations store rupees
  const remaining = reg.final_price * 100 - refunded;
  if (remaining <= 0) {
    return NextResponse.json({ error: "Payment is already fully refunded" }, { status: 422 });
  }
  const refundAmount = (amount_paise as number | undefined) ?? remaining;
  if (refundAmount > remaining) {
    return NextResponse.json(
      { error: `Cannot refund ₹${refundAmount / 100}: only ₹${remaining / 100} remaining refundable` },
      { status: 422 },
    );
  }

  const actorEmail = session.email;
  const actorRole  = session.role;

  // Step 2: pending row = concurrency lock. Unique index violation (23505) means another refund is in flight.
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
      reason: `Approved refund request ${request.id}`,
      initiated_by_admin: true,
      initiated_by_email: actorEmail,
      initiated_by_role: actorRole,
      metadata: { ip: getClientIp(req), request_id: request.id },
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertErr?.code === "23505") {
    return NextResponse.json({ error: "A refund is already in progress for this registration" }, { status: 409 });
  }
  if (insertErr || !refundRecord) {
    console.error("[it-run/admin/refund] Failed to create refund record:", insertErr?.message);
    return NextResponse.json({ error: "Failed to create refund record" }, { status: 500 });
  }

  // Link the request to this execution attempt (only while still approved).
  const { error: linkErr } = await db
    .from("it_run_refund_requests")
    .update({ refund_id: refundRecord.id, decided_by_email: actorEmail, updated_at: new Date().toISOString() })
    .eq("id", request.id)
    .eq("status", "approved");
  if (linkErr) {
    console.error("[it-run/admin/refund] Failed to link request:", linkErr.message);
    await markRefundFailed(db, refundRecord.id, "Could not link refund request; no money moved", actorEmail);
    return NextResponse.json({ error: "Failed to link refund request" }, { status: 500 });
  }

  await db.from("it_run_refund_audit").insert({
    event_id: event.id,
    refund_id: refundRecord.id,
    registration_id: reg.id,
    action: "REFUND_EXECUTION_STARTED",
    details: { amount_paise: refundAmount, request_id: request.id, actor: actorEmail, role: actorRole },
  });

  // Step 3: Razorpay (server-side only)
  let rzpRefund: { id: string; status: "pending" | "processed" | "failed" };
  try {
    rzpRefund = await createRefund(reg.razorpay_payment_id, {
      amount: refundAmount,
      speed: "optimum",
      notes: { registration: reg.registration_code, refund_record: refundRecord.id },
    });
  } catch (e) {
    const definitive = e instanceof RazorpayApiError && e.status >= 400 && e.status < 500;
    if (definitive) {
      await markRefundFailed(db, refundRecord.id, String((e as Error).message), actorEmail);
      return NextResponse.json({
        ok: false,
        error: "Razorpay rejected the refund. Recorded as failed; the request remains approved for retry.",
        refund_record_id: refundRecord.id,
      }, { status: 502 });
    }
    // Ambiguous: Razorpay may have created the refund. Keep it pending for reconciliation.
    console.error("[it-run/admin/refund] Razorpay outcome unknown, left pending:", e);
    return NextResponse.json({
      ok: false,
      error: "Refund outcome unknown. It is held as pending; reconcile before retrying.",
      refund_record_id: refundRecord.id,
    }, { status: 202 });
  }

  if (rzpRefund.status === "failed") {
    await markRefundFailed(db, refundRecord.id, "Razorpay returned status failed", actorEmail);
    return NextResponse.json({ ok: false, error: "Razorpay reported the refund as failed", refund_record_id: refundRecord.id }, { status: 502 });
  }

  if (rzpRefund.status === "processed") {
    const finalized = await finalizeRefundProcessed(db, refundRecord.id, rzpRefund.id, actorEmail);
    if (finalized) {
      sendRefundConfirmationEmail(reg.id, reg.registration_code, reg.lead_email, refundAmount)
        .catch(err => console.error(`[it-run/admin/refund] Email send failed: ${err}`));
    }
  } else {
    // Razorpay accepted but has not settled. Record the Razorpay ID; the webhook finalizes it.
    await db
      .from("it_run_refunds")
      .update({ razorpay_refund_id: rzpRefund.id, updated_at: new Date().toISOString() })
      .eq("id", refundRecord.id);
  }

  return NextResponse.json({
    ok: true,
    refund_record_id: refundRecord.id,
    razorpay_refund_id: rzpRefund.id,
    status: rzpRefund.status,
    refund_amount: refundAmount,
    registration_code: reg.registration_code,
  });
}

// GET /api/it-run/admin/refund?registration_id=<id>
// Refund history for a registration (admin only).
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
