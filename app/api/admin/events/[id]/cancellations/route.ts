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
// Review a cancellation_request (approve or reject) without auto-cancelling.
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
    .select("id, registration_id, event_id, user_email, status")
    .eq("id", body.request_id)
    .eq("event_id", eventId)
    .single();

  if (fetchErr || !req_) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req_.status !== "pending") return NextResponse.json({ error: "Request is not pending" }, { status: 409 });

  const now = new Date().toISOString();
  await db.from("cancellation_requests").update({
    status:      body.action === "approve" ? "approved" : "rejected",
    reviewed_at: now,
    reviewed_by: "admin",
    review_note: body.note ?? null,
  }).eq("id", body.request_id);

  void db.from("cancellation_audit_log").insert({
    event_id:          eventId,
    registration_id:   req_.registration_id,
    registration_code: body.request_id,
    action:            "cancel_request_reviewed",
    actor:             "admin",
    actor_type:        "admin",
    payload:           { action: body.action, note: body.note, request_id: body.request_id },
  });

  return NextResponse.json({ success: true, status: body.action === "approve" ? "approved" : "rejected" });
}
