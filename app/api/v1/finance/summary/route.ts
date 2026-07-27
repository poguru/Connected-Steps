import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, v1Single, parseFilters } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await requireV1Auth(req, "finance:read");
  if (ctx instanceof NextResponse) return ctx;

  const db = getSupabaseServer();
  const f  = parseFilters(req, ["month", "event_id"]);

  // Revenue from event registrations
  let regQ = db
    .from("event_registrations")
    .select("final_price, payment_status, events!inner(organization_id)")
    .eq("events.organization_id", ctx.organization_id)
    .eq("payment_status", "paid");

  if (f.event_id) regQ = regQ.eq("event_id", f.event_id);

  const { data: regs, error: regErr } = await regQ;
  if (regErr) { finishV1Request(ctx, req, 500); return V1_ERRORS.internal(); }

  const totalRevenue = (regs ?? []).reduce((sum, r) => sum + parseFloat(String(r.final_price ?? 0)), 0);
  const totalRegs    = (regs ?? []).length;

  // Outstanding refunds
  const { data: refunds } = await db
    .from("cancellation_requests")
    .select("refund_amount")
    .eq("status", "approved");

  const totalRefunds = (refunds ?? []).reduce((sum, r) => sum + parseFloat(String(r.refund_amount ?? 0)), 0);

  const summary = {
    total_revenue_inr:      parseFloat(totalRevenue.toFixed(2)),
    total_registrations:    totalRegs,
    total_refunds_inr:      parseFloat(totalRefunds.toFixed(2)),
    net_revenue_inr:        parseFloat((totalRevenue - totalRefunds).toFixed(2)),
    currency:               "INR",
    filters_applied:        f,
  };

  const res = v1Single(summary);
  finishV1Request(ctx, req, 200);
  return res;
}
