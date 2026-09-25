import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/payments
// ?status=paid|pending|failed|expired|free|payment_attempted|all
// ?limit=50&offset=0&q=<search>
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "all";
  const q      = searchParams.get("q")?.trim() ?? "";
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const db = getSupabaseServer();
  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let query = db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email,
      payment_status, final_price, base_price, discount_amount,
      razorpay_order_id, razorpay_payment_id,
      created_at, confirmation_email_sent_at,
      it_run_categories ( name, color )
    `, { count: "exact" })
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") query = query.eq("payment_status", status);
  if (q)               query = query.or(`lead_email.ilike.%${q}%,registration_code.ilike.%${q}%,razorpay_payment_id.ilike.%${q}%`);

  const { data: registrations, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ registrations, total: count ?? 0, offset, limit });
}
