import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";

// Admin review of participant refund requests.
// Approving or rejecting a request NEVER moves money. Execution is a separate, explicitly
// confirmed step on POST /api/it-run/admin/refund, which requires an approved request.
// Roles: event_admin (super_admin bypasses via requireRole). verification_team and
// volunteers cannot access this.

const MIN_EXPLANATION = 10;
const MAX_EXPLANATION = 1000;

// GET /api/it-run/admin/refund-requests?status=requested|approved|rejected|executed|all
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "requested";
  const allowed = ["requested", "approved", "rejected", "executed", "cancelled", "all"];
  if (!allowed.includes(status)) return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let query = db
    .from("it_run_refund_requests")
    .select(`
      id, status, request_reason, requested_by_email, decision_explanation,
      decided_by_email, decided_at, created_at, refund_id,
      it_run_registrations!inner (
        id, registration_code, lead_email, final_price, payment_status, registration_status,
        razorpay_payment_id,
        it_run_participants ( first_name, last_name, company_name, verification_status )
      ),
      it_run_refunds ( id, status, amount_paise, razorpay_refund_id, processed_at, failure_reason )
    `)
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[it-run/admin/refund-requests] query error:", error.message);
    return NextResponse.json({ error: "Failed to load refund requests" }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

// PATCH /api/it-run/admin/refund-requests
// Body: { requestId, decision: "approve" | "reject", explanation }
// explanation is required for both decisions and is shown to the participant as the admin response.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { requestId?: string; decision?: string; explanation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { requestId, decision } = body;
  const explanation = typeof body.explanation === "string" ? body.explanation.trim() : "";

  if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (explanation.length < MIN_EXPLANATION || explanation.length > MAX_EXPLANATION) {
    return NextResponse.json({ error: `An explanation of ${MIN_EXPLANATION}-${MAX_EXPLANATION} characters is required` }, { status: 400 });
  }

  const db = getSupabaseServer();
  const newStatus = decision === "approve" ? "approved" : "rejected";
  const now = new Date().toISOString();

  // Conditional update: only a 'requested' row can be decided, so a double-click cannot flip a decision.
  const { data: updated, error: updErr } = await db
    .from("it_run_refund_requests")
    .update({
      status: newStatus,
      decision_explanation: explanation,
      decided_by_email: session.email,
      decided_at: now,
      updated_at: now,
    })
    .eq("id", requestId)
    .eq("status", "requested")
    .select("id, registration_id")
    .maybeSingle<{ id: string; registration_id: string }>();

  if (updErr) {
    console.error("[it-run/admin/refund-requests] update failed:", updErr.message);
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Request not found or already decided" }, { status: 409 });
  }

  await db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role: session.role,
    action: `refund_request_${newStatus}`,
    entity_type: "refund_request",
    entity_id: requestId,
    ip: getClientIp(req),
    detail: { registration_id: updated.registration_id, explanation },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, status: newStatus });
}
