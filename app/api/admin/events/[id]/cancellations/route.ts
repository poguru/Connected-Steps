import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/cancellations
// Returns:
//  - cancelled registrations with refund status
//  - open cancellation_requests (pending review)
//  - audit log entries
//  - aggregate stats

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const [cancelledRes, requestsRes, auditRes] = await Promise.all([
    // Cancelled registrations with refund info
    db.from("event_registrations")
      .select(`
        id, registration_code, user_name, user_email, phone,
        payment_status, final_price,
        cancelled_at, cancelled_by, cancellation_reason,
        refund_status, refund_amount, refund_id, refunded_at,
        refund_failure_reason, refund_requested_by, refund_requested_at,
        razorpay_payment_id
      `)
      .eq("event_id", eventId)
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false }),

    // Open cancellation requests from users
    db.from("cancellation_requests")
      .select("id, registration_id, user_email, user_name, reason, status, requested_at, reviewed_at, reviewed_by, review_note")
      .eq("event_id", eventId)
      .order("requested_at", { ascending: false })
      .limit(100),

    // Recent audit log entries
    db.from("cancellation_audit_log")
      .select("id, action, actor, actor_type, payload, created_at, registration_code")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const cancelled = cancelledRes.data ?? [];
  const requests  = requestsRes.data ?? [];
  const audit     = auditRes.data ?? [];

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const paidCancelled   = cancelled.filter(r => r.payment_status === "paid");
  const refundPending   = paidCancelled.filter(r => r.refund_status === "pending");
  const refundProcessed = paidCancelled.filter(r => r.refund_status === "processed");
  const refundFailed    = paidCancelled.filter(r => r.refund_status === "failed");
  const totalRefunded   = refundProcessed.reduce((s, r) => s + (r.refund_amount ?? (r.final_price ?? 0) * 100), 0);
  const pendingRequests = requests.filter(r => r.status === "pending");

  const stats = {
    total_cancelled:     cancelled.length,
    paid_cancelled:      paidCancelled.length,
    refund_pending:      refundPending.length,
    refund_processed:    refundProcessed.length,
    refund_failed:       refundFailed.length,
    total_refunded_inr:  Math.round(totalRefunded / 100),
    pending_requests:    pendingRequests.length,
  };

  return NextResponse.json({ cancelled, requests, audit, stats });
}

// PATCH /api/admin/events/[id]/cancellations
// Review a cancellation_request: approve (also cancels the registration)
//   or reject (leaves registration unchanged).
// Body: { request_id: string, action: "approve" | "reject", note?: string }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json() as { request_id: string; action: "approve" | "reject"; note?: string };
  if (!body.request_id || !["approve", "reject"].includes(body.action)) {
    return NextResponse.json({ error: "request_id and action (approve|reject) required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: req_, error: fetchErr } = await db
    .from("cancellation_requests")
    .select("id, registration_id, event_id, user_email, status, reason")
    .eq("id", body.request_id)
    .eq("event_id", eventId)
    .single();

  if (fetchErr || !req_) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req_.status !== "pending") return NextResponse.json({ error: "Request is not pending" }, { status: 409 });

  const now     = new Date().toISOString();
  const newStatus = body.action === "approve" ? "approved" : "rejected";

  // ── Mark the cancellation request ────────────────────────────────────────────
  await db.from("cancellation_requests").update({
    status:      newStatus,
    reviewed_at: now,
    reviewed_by: "admin",
    review_note: body.note ?? null,
  }).eq("id", body.request_id);

  // ── On approval: also cancel the actual registration ─────────────────────────
  // Without this step the slot is never freed and the participant can still scan.
  let registrationCode: string | null = null;
  if (body.action === "approve" && req_.registration_id) {
    const { data: reg } = await db
      .from("event_registrations")
      .select("id, registration_code, status, payment_status")
      .eq("id", req_.registration_id)
      .single();

    if (reg && reg.status !== "cancelled") {
      registrationCode = reg.registration_code;

      // Cancel the booking row
      await db.from("event_registrations").update({
        status:              "cancelled",
        cancelled_at:        now,
        cancelled_by:        "admin",
        cancellation_reason: req_.reason ?? body.note ?? "Cancellation request approved by admin",
        // Refund status: mark pending for paid registrations — admin must
        // process via the Cancellations report page.
        refund_status: reg.payment_status === "paid" ? "pending" : "not_applicable",
      }).eq("id", reg.id);

      // Invalidate all participant QR tokens so check-in scans are rejected
      await db.from("event_participants")
        .update({ status: "cancelled" })
        .eq("registration_id", reg.id);

      void db.from("cancellation_audit_log").insert({
        event_id:          eventId,
        registration_id:   req_.registration_id,
        registration_code: reg.registration_code,
        action:            "cancelled",
        actor:             "admin",
        actor_type:        "admin",
        payload: {
          reason:         "cancellation_request_approved",
          request_id:     body.request_id,
          note:           body.note,
          user_reason:    req_.reason,
          payment_status: reg.payment_status,
        },
      });
    }
  }

  void db.from("cancellation_audit_log").insert({
    event_id:          eventId,
    registration_id:   req_.registration_id,
    registration_code: registrationCode ?? body.request_id,
    action:            "cancel_request_reviewed",
    actor:             "admin",
    actor_type:        "admin",
    payload:           { action: body.action, note: body.note, request_id: body.request_id },
  });

  return NextResponse.json({
    success:             true,
    status:              newStatus,
    registration_cancelled: body.action === "approve" && !!registrationCode,
  });
}
