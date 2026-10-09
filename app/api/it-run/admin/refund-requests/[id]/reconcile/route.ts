import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { reconcileRefund, type ReconcileOutcome } from "@/lib/it-run-refunds";

// POST /api/it-run/admin/refund-requests/[id]/reconcile
// Checks every pending refund on this request's booking against Razorpay's own refund list,
// and finalizes or fails it accordingly. Never creates a refund. Safe to repeat.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data: request } = await db
    .from("it_run_refund_requests")
    .select("id, registration_id")
    .eq("id", id)
    .maybeSingle<{ id: string; registration_id: string }>();
  if (!request) return NextResponse.json({ error: "Refund request not found" }, { status: 404 });

  const { data: pending, error } = await db
    .from("it_run_refunds")
    .select("id, status, razorpay_refund_id, razorpay_payment_id")
    .eq("registration_id", request.registration_id)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: "Failed to load refunds" }, { status: 500 });

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, outcomes: [], message: "No pending refunds to reconcile." });
  }

  const outcomes: ReconcileOutcome[] = [];
  for (const refund of pending as Array<{ id: string; status: string; razorpay_refund_id: string | null; razorpay_payment_id: string | null }>) {
    try {
      outcomes.push(await reconcileRefund(db, refund, session.email));
    } catch (e) {
      // Razorpay unreachable: keep the refund pending and report it. Never guess an outcome.
      console.error("[it-run/admin/refund-requests/reconcile] check failed:", (e as Error).name);
      outcomes.push({ kind: "still_pending", refundId: refund.id, reason: "Could not reach Razorpay to check this refund. Try again later." });
    }
  }

  await db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role: session.role,
    action: "refund_reconcile",
    entity_type: "refund_request",
    entity_id: id,
    ip: getClientIp(req),
    detail: { outcomes },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, outcomes });
}
