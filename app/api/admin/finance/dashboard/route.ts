import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getFinanceDashboard, paiseToRupees } from "@/lib/finance-service";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const organization_id = searchParams.get("org_id")    ?? undefined;
  const event_id        = searchParams.get("event_id")  ?? undefined;
  const date_from       = searchParams.get("date_from") ?? undefined;
  const date_to         = searchParams.get("date_to")   ?? undefined;

  const summary = await getFinanceDashboard({ organization_id, event_id, date_from, date_to });

  // Convert paise to rupees for the API response (easier to consume in UI)
  return NextResponse.json({
    gross_revenue:        paiseToRupees(summary.gross_revenue_paise),
    net_revenue:          paiseToRupees(summary.net_revenue_paise),
    pending_payments:     paiseToRupees(summary.pending_payments_paise),
    refunded:             paiseToRupees(summary.refunded_paise),
    failed_payments:      paiseToRupees(summary.failed_payments_paise),
    coupon_discounts:     paiseToRupees(summary.coupon_discounts_paise),
    event_revenue:        paiseToRupees(summary.event_revenue_paise),
    membership_revenue:   paiseToRupees(summary.membership_revenue_paise),
    merchandise_revenue:  paiseToRupees(summary.merchandise_revenue_paise),
    donation_revenue:     paiseToRupees(summary.donation_revenue_paise),
    sponsor_revenue:      paiseToRupees(summary.sponsor_revenue_paise),
    manual_payments:      paiseToRupees(summary.manual_payments_paise),
    payouts_pending:      paiseToRupees(summary.payouts_pending_paise),
    payouts_paid:         paiseToRupees(summary.payouts_paid_paise),
    platform_fees:        paiseToRupees(summary.platform_fees_paise),
    gst_collected:        summary.gst_collected_rupees,
    currency:             "INR",
    filters:              { organization_id, event_id, date_from, date_to },
  });
}
