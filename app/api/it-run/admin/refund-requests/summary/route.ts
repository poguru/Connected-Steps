import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/refund-requests/summary
// Live counts from the database. Definitions:
//   pendingReview = requests awaiting a decision
//   approved      = requests approved but not yet refunded (includes processing)
//   processing    = refund attempts created at Razorpay but not yet confirmed (refund pending)
//   refunded      = refunds confirmed by Razorpay (refund processed)
//   failed        = refund attempts that failed (refund failed)
//   rejected      = requests rejected by an admin
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const count = async (table: "it_run_refund_requests" | "it_run_refunds", filters: Record<string, string>) => {
    let query = db.from(table).select("id", { count: "exact", head: true }).eq("event_id", event.id);
    for (const [k, v] of Object.entries(filters)) query = query.eq(k, v);
    const { count: n, error } = await query;
    if (error) throw new Error(`count ${table} failed: ${error.message}`);
    return n ?? 0;
  };

  try {
    const [total, pendingReview, approved, rejected, processing, refunded, failed] = await Promise.all([
      count("it_run_refund_requests", {}),
      count("it_run_refund_requests", { status: "requested" }),
      count("it_run_refund_requests", { status: "approved" }),
      count("it_run_refund_requests", { status: "rejected" }),
      count("it_run_refunds", { status: "pending" }),
      count("it_run_refunds", { status: "processed" }),
      count("it_run_refunds", { status: "failed" }),
    ]);
    return NextResponse.json({ total, pendingReview, approved, processing, refunded, failed, rejected });
  } catch (e) {
    console.error("[it-run/admin/refund-requests/summary]", (e as Error).message);
    return NextResponse.json({ error: "Failed to load summary" }, { status: 500 });
  }
}
