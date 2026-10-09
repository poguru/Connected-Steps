import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { computeRefundableBreakdown } from "@/lib/it-run-refunds";

// Admin review of participant refund requests.
// Approving or rejecting a request NEVER moves money. Execution is a separate, explicitly
// confirmed step on POST /api/it-run/admin/refund, which requires an approved request.
// Roles: event_admin (super_admin bypasses via requireRole). Other roles cannot access this.

const MIN_EXPLANATION = 10;
const MAX_EXPLANATION = 1000;
const REQUEST_STATUSES = ["requested", "approved", "rejected", "executed", "cancelled"] as const;
const REFUND_STATUSES = ["pending", "processed", "failed"] as const;

// GET /api/it-run/admin/refund-requests
//   status=all|requested|approved|rejected|executed|cancelled   (request status)
//   refund=pending|processed|failed                              (refund status)
//   category=<category id>
//   q=<text>   matches registration code, lead email, participant name or mobile
//   page=0&limit=25   (limit max 100)
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "requested";
  const refund = sp.get("refund");
  const category = sp.get("category");
  const q = (sp.get("q") ?? "").trim();
  const page = Math.max(0, parseInt(sp.get("page") ?? "0", 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "25", 10) || 25));

  if (status !== "all" && !(REQUEST_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  if (refund && !(REFUND_STATUSES as readonly string[]).includes(refund)) {
    return NextResponse.json({ error: "Invalid refund filter" }, { status: 400 });
  }
  if (q.length > 100) return NextResponse.json({ error: "Search text is too long" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Free-text search: resolve matching registrations (code / email) and participants (name / mobile)
  // to registration IDs, then filter the requests by those IDs.
  let searchRegIds: string[] | null = null;
  if (q) {
    const term = `%${q.replace(/[%_,()]/g, " ")}%`;
    const [{ data: regHits }, { data: partHits }] = await Promise.all([
      db.from("it_run_registrations").select("id").eq("event_id", event.id)
        .or(`registration_code.ilike.${term},lead_email.ilike.${term}`).limit(500),
      db.from("it_run_participants").select("registration_id").eq("event_id", event.id)
        .or(`first_name.ilike.${term},last_name.ilike.${term},mobile.ilike.${term}`).limit(500),
    ]);
    const ids = new Set<string>([
      ...((regHits ?? []) as Array<{ id: string }>).map(r => r.id),
      ...((partHits ?? []) as Array<{ registration_id: string }>).map(p => p.registration_id),
    ]);
    if (ids.size === 0) {
      return NextResponse.json({ requests: [], total: 0, page, limit });
    }
    searchRegIds = [...ids];
  }

  const refundJoin = refund ? "!inner" : "";
  const selectCols = `
      id, status, request_reason, requested_by_email, decision_explanation,
      decided_by_email, decided_at, created_at, refund_id, registration_id,
      it_run_registrations!inner (
        id, registration_code, lead_email, final_price, payment_status, registration_status,
        razorpay_order_id, razorpay_payment_id, category_id,
        it_run_categories ( id, name ),
        it_run_participants ( id, participant_type, first_name, last_name, mobile, email, company_name, verification_status ),
        it_run_refunds ( id, status, amount_paise, razorpay_refund_id, processed_at, failure_reason, created_at )
      ),
      request_refund:it_run_refunds!refund_id${refundJoin} ( id, status, amount_paise, razorpay_refund_id, processed_at, failure_reason )
    `;

  let query = db
    .from("it_run_refund_requests")
    .select(selectCols, { count: "exact" })
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (status !== "all") query = query.eq("status", status);
  if (refund) query = query.eq("request_refund.status", refund);
  if (category) query = query.eq("it_run_registrations.category_id", category);
  if (searchRegIds) query = query.in("registration_id", searchRegIds);

  const { data, count, error } = await query;
  if (error) {
    console.error("[it-run/admin/refund-requests] query error:", error.message);
    return NextResponse.json({ error: "Failed to load refund requests" }, { status: 500 });
  }

  // Refundable balance is computed from the registration's refund rows, not the single linked refund.
  type ListRow = Record<string, unknown> & {
    it_run_registrations: { final_price: number; it_run_refunds: Array<{ status: string; amount_paise: number }> };
  };
  const requests = ((data ?? []) as unknown as ListRow[]).map(r => {
    const reg = r.it_run_registrations;
    const breakdown = computeRefundableBreakdown(reg.final_price, reg.it_run_refunds ?? []);
    return { ...r, refundable: breakdown };
  });

  return NextResponse.json({ requests, total: count ?? 0, page, limit });
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
