import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/refund-reconciliation
// Fetch all refunds with detailed status info
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Fetch all refunds with related registration info
  const { data: refunds, error } = await db
    .from("it_run_refunds")
    .select(`
      id, registration_id, razorpay_payment_id, razorpay_refund_id,
      amount_paise, status, reason, initiated_by_email, created_at,
      processed_at, failure_reason, metadata,
      it_run_registrations (
        id, registration_code, lead_email, final_price, payment_status,
        registration_status, category_id
      )
    `)
    .eq("event_id", event.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[refund-reconciliation] Query error:", error);
    return NextResponse.json({ error: "Failed to fetch refunds" }, { status: 500 });
  }

  // Categorize refunds
  const stats = {
    total: refunds?.length ?? 0,
    pending: 0,
    processed: 0,
    failed: 0,
    totalRefunded: 0,
  };

  const reconciliationIssues: Array<{
    type: string;
    refundId: string;
    registrationCode: string;
    details: string;
  }> = [];

  (refunds ?? []).forEach((r: any) => {
    const reg = r.it_run_registrations;

    // Count by status
    if (r.status === "pending") stats.pending++;
    if (r.status === "processed") stats.processed++;
    if (r.status === "failed") stats.failed++;
    if (r.status === "processed") stats.totalRefunded += r.amount_paise;

    // Detect mismatches
    if (r.status === "processed" && reg?.payment_status !== "refunded" && reg?.payment_status !== "partially_refunded") {
      reconciliationIssues.push({
        type: "STATUS_MISMATCH",
        refundId: r.id,
        registrationCode: reg?.registration_code ?? "unknown",
        details: `Refund marked processed but registration payment_status is ${reg?.payment_status}`,
      });
    }

    if (r.status === "processed" && reg?.registration_status !== "cancelled") {
      reconciliationIssues.push({
        type: "REGISTRATION_NOT_CANCELLED",
        refundId: r.id,
        registrationCode: reg?.registration_code ?? "unknown",
        details: `Refund processed but registration status is still ${reg?.registration_status}`,
      });
    }

    if (r.status === "pending" && new Date(r.created_at).getTime() < Date.now() - 3600000) {
      // Pending for > 1 hour
      reconciliationIssues.push({
        type: "STALE_PENDING",
        refundId: r.id,
        registrationCode: reg?.registration_code ?? "unknown",
        details: `Refund pending for > 1 hour (created ${new Date(r.created_at).toLocaleString("en-IN")})`,
      });
    }
  });

  return NextResponse.json({
    stats,
    issues: reconciliationIssues,
    refunds: refunds ?? [],
  });
}
