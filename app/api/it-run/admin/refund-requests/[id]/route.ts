import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { computeRefundableBreakdown, paidAmountPaise } from "@/lib/it-run-refunds";

// GET /api/it-run/admin/refund-requests/[id]
// Full context for one request: booking-level payment, every participant on the booking,
// all refund attempts, and the audit trail. Read-only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data: request, error } = await db
    .from("it_run_refund_requests")
    .select(`
      id, status, request_reason, requested_by_email, decision_explanation,
      decided_by_email, decided_at, created_at, refund_id, registration_id,
      request_kind, requested_amount_paise, target_category_id,
      it_run_registrations (
        id, registration_code, lead_email, final_price, amount_paid_paise, base_price, discount_amount,
        payment_status, registration_status, participant_count, razorpay_order_id, razorpay_payment_id,
        cancelled_reason, cancelled_at, created_at,
        it_run_categories ( id, name ),
        it_run_participants ( id, participant_type, first_name, last_name, mobile, email, company_name, verification_status, bib_number ),
        it_run_refunds ( id, status, amount_paise, razorpay_refund_id, processed_at, failure_reason, created_at, reason, initiated_by_email )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[it-run/admin/refund-requests/:id] query error:", error.message);
    return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
  }
  if (!request) return NextResponse.json({ error: "Refund request not found" }, { status: 404 });

  type RegistrationDetail = {
    id: string; final_price: number; amount_paid_paise: number | null;
    it_run_refunds: Array<{ id: string; status: string; amount_paise: number }> | null;
  };
  const reg = (request as unknown as { it_run_registrations: RegistrationDetail | null }).it_run_registrations;
  const refunds = reg?.it_run_refunds ?? [];

  // For a downgrade: the category the registration moves to, and the amount the participant was shown
  const downgradeTargetId = (request as unknown as { target_category_id: string | null }).target_category_id;
  const { data: target } = downgradeTargetId
    ? await db.from("it_run_categories").select("name, price_rupees").eq("id", downgradeTargetId).maybeSingle<{ name: string; price_rupees: number }>()
    : { data: null };

  const [requestAudit, refundAudit] = await Promise.all([
    db.from("it_run_audit_logs")
      .select("action, actor_email, actor_role, detail, created_at")
      .eq("entity_type", "refund_request")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("it_run_refund_audit")
      .select("action, refund_id, details, timestamp")
      .eq("registration_id", reg?.id ?? "")
      .order("timestamp", { ascending: false })
      .limit(100),
  ]);

  const requestKind = (request as unknown as { request_kind: string }).request_kind;
  const requestedAmount = (request as unknown as { requested_amount_paise: number | null }).requested_amount_paise;

  return NextResponse.json({
    request: {
      ...request,
      refundable: computeRefundableBreakdown(reg ? paidAmountPaise(reg) : 0, refunds),
      downgrade: requestKind === "downgrade" && target && requestedAmount
        ? {
            targetCategoryName: target.name,
            targetPriceRupees: target.price_rupees,
            refundPaise: requestedAmount,
          }
        : null,
    },
    audit: {
      requestDecisions: requestAudit.data ?? [],
      refundActions: refundAudit.data ?? [],
    },
  });
}
