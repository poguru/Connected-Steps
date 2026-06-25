import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// Razorpay standard fee structure (as of 2026)
// Domestic cards/UPI/netbanking: 2% + 18% GST on fee
const RAZORPAY_FEE_RATE    = 0.02;   // 2% of transaction
const RAZORPAY_GST_ON_FEE  = 0.18;   // 18% GST on Razorpay's fee

function calcRazorpayDeduction(grossAmount: number) {
  const rpFee       = Math.round(grossAmount * RAZORPAY_FEE_RATE * 100) / 100;
  const gstOnFee    = Math.round(rpFee * RAZORPAY_GST_ON_FEE * 100) / 100;
  const totalDeduct = Math.round((rpFee + gstOnFee) * 100) / 100;
  const netSettled  = Math.round((grossAmount - totalDeduct) * 100) / 100;
  return { rpFee, gstOnFee, totalDeduct, netSettled };
}

// GET /api/admin/finance/settlement
// Internal settlement report — shows Razorpay deductions per invoice.
// Never exposed to customers — admin only.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const sp = req.nextUrl.searchParams;
  const from   = sp.get("from") ?? "";
  const to     = sp.get("to")   ?? "";
  const type   = sp.get("type") ?? "";

  let query = db
    .from("invoices")
    .select("id, invoice_number, user_name, user_email, product_name, product_type, total_amount, payment_id, created_at")
    .gt("total_amount", 0)
    .order("created_at", { ascending: false })
    .limit(500);

  if (from)  query = query.gte("created_at", from);
  if (to)    query = query.lte("created_at", to + "T23:59:59Z");
  if (type)  query = query.eq("product_type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map(inv => {
    const d = calcRazorpayDeduction(inv.total_amount ?? 0);
    return {
      invoice_number:   inv.invoice_number,
      user_name:        inv.user_name,
      user_email:       inv.user_email,
      product_name:     inv.product_name,
      product_type:     inv.product_type,
      payment_id:       inv.payment_id,
      date:             inv.created_at,
      gross_amount:     inv.total_amount,
      razorpay_fee:     d.rpFee,
      gst_on_rp_fee:    d.gstOnFee,
      total_deduction:  d.totalDeduct,
      net_settlement:   d.netSettled,
    };
  });

  const summary = {
    total_transactions:  rows.length,
    gross_total:         rows.reduce((s, r) => s + r.gross_amount,    0),
    razorpay_fees_total: rows.reduce((s, r) => s + r.razorpay_fee,   0),
    gst_on_fees_total:   rows.reduce((s, r) => s + r.gst_on_rp_fee,  0),
    total_deductions:    rows.reduce((s, r) => s + r.total_deduction, 0),
    net_settled_total:   rows.reduce((s, r) => s + r.net_settlement,  0),
  };

  return NextResponse.json({ summary, rows });
}
