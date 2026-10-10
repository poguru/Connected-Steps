import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { createRefund, RazorpayApiError } from "@/lib/razorpay-client";
import { sendRefundConfirmationEmail } from "@/lib/it-run-email";
import {
  getRefundedAmountPaise,
  finalizeRefundProcessed,
  markRefundFailed,
  paidAmountPaise,
} from "@/lib/it-run-refunds";
import { requiredParticipantCount, type CategoryType } from "@/lib/it-run-category-rules";

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
    .select("id, event_id, registration_code, razorpay_order_id, razorpay_payment_id, final_price, amount_paid_paise, category_id, participant_count, payment_status, registration_status, lead_email")
    .eq("id", registration_id)
    .eq("event_id", event.id)
    .maybeSingle<{
      id: string; event_id: string; registration_code: string;
      razorpay_order_id: string | null; razorpay_payment_id: string | null;
      final_price: number; amount_paid_paise: number | null; category_id: string; participant_count: number;
      payment_status: string; registration_status: string;
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
    .select("id, registration_id, status, request_kind, requested_amount_paise, target_category_id")
    .eq("id", request_id)
    .maybeSingle<{
      id: string; registration_id: string; status: string;
      request_kind: string; requested_amount_paise: number | null; target_category_id: string | null;
    }>();
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
  // Refund amounts are paise; registrations store rupees. The limit is the amount originally paid,
  // so a downgrade (which lowers the current price) does not shrink what can be refunded.
  const remaining = paidAmountPaise(reg) - refunded;
  if (remaining <= 0) {
    return NextResponse.json({ error: "Payment is already fully refunded" }, { status: 422 });
  }

  // Downgrade: the amount is the one the participant was shown and the admin approved, and the target
  // seats are reserved before any money moves. Nothing is refunded if the seats cannot be reserved.
  let refundAmount: number;
  let reservedCategoryId: string | null = null;
  if (request.request_kind === "downgrade") {
    const requested = request.requested_amount_paise;
    if (!requested || !request.target_category_id) {
      return NextResponse.json({ error: "This downgrade request is incomplete" }, { status: 422 });
    }
    if (amount_paise !== undefined && amount_paise !== requested) {
      return NextResponse.json({ error: "A downgrade refund uses the amount in the approved request" }, { status: 422 });
    }
    const { data: target } = await db
      .from("it_run_categories")
      .select("id, name, category_type, price_rupees, is_active, event_id")
      .eq("id", request.target_category_id)
      .maybeSingle<{ id: string; name: string; category_type: CategoryType; price_rupees: number; is_active: boolean; event_id: string }>();
    if (!target || !target.is_active || target.event_id !== reg.event_id) {
      return NextResponse.json({ error: "The target category is no longer available. Nothing has been refunded." }, { status: 409 });
    }
    // The stored amount must still equal the difference in today's prices and the group size must still fit
    const priceStillMatches = target.price_rupees > 0 && target.price_rupees < reg.final_price &&
      reg.final_price * 100 - requested === target.price_rupees * 100;
    if (!priceStillMatches) {
      return NextResponse.json({ error: "The category price has changed since the request. Ask the participant to request again. Nothing has been refunded." }, { status: 409 });
    }
    if (requiredParticipantCount(target.category_type) !== reg.participant_count) {
      return NextResponse.json({ error: `${target.name} no longer fits this group size. Nothing has been refunded.` }, { status: 409 });
    }
    if (requested > remaining) {
      return NextResponse.json({ error: `Cannot refund ₹${requested / 100}: only ₹${remaining / 100} remaining refundable` }, { status: 422 });
    }
    const { data: seats, error: seatErr } = await db.rpc("itr_reserve_capacity", {
      p_category_id: target.id,
      p_increment: reg.participant_count,
    });
    if (seatErr || seats !== "confirmed") {
      return NextResponse.json({ error: `${target.name} is full. Nothing has been refunded.` }, { status: 409 });
    }
    reservedCategoryId = target.id;
    refundAmount = requested;
  } else {
    refundAmount = (amount_paise as number | undefined) ?? remaining;
    if (refundAmount > remaining) {
      return NextResponse.json(
        { error: `Cannot refund ₹${refundAmount / 100}: only ₹${remaining / 100} remaining refundable` },
        { status: 422 },
      );
    }
  }

  const releaseReservedSeats = async () => {
    if (reservedCategoryId) {
      await db.rpc("itr_release_capacity", { p_category_id: reservedCategoryId, p_count: reg.participant_count });
    }
  };

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
    await releaseReservedSeats();
    return NextResponse.json({ error: "A refund is already in progress for this registration" }, { status: 409 });
  }
  if (insertErr || !refundRecord) {
    console.error("[it-run/admin/refund] Failed to create refund record:", insertErr?.message);
    await releaseReservedSeats();
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
