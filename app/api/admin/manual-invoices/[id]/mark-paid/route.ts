import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/manual-invoices/[id]/mark-paid
// Body: { status, amount, payment_date, payment_method, reference_number, notes }
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as {
    status?:           string;
    amount?:           number;
    payment_date?:     string;
    payment_method?:   string;
    reference_number?: string;
    notes?:            string;
  };

  const { data: invoice } = await db.from("manual_invoices")
    .select("id, invoice_number, payment_status, grand_total, advance_received").eq("id", id).single();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.payment_status === "cancelled") {
    return NextResponse.json({ error: "Cannot mark a cancelled invoice as paid" }, { status: 409 });
  }

  const newStatus = body.status ?? "paid";
  const amount    = body.amount ?? Number(invoice.grand_total);

  // Record payment
  await db.from("manual_invoice_payments").insert({
    invoice_id:       id,
    amount,
    payment_date:     body.payment_date     ?? new Date().toISOString().slice(0, 10),
    payment_method:   body.payment_method   ?? "bank_transfer",
    reference_number: body.reference_number ?? null,
    notes:            body.notes            ?? null,
    created_by:       "admin",
  });

  // Compute balance_due from all payments
  const { data: allPayments } = await db.from("manual_invoice_payments")
    .select("amount").eq("invoice_id", id);
  const totalPaid = (allPayments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const balanceDue = Math.max(0, Number(invoice.grand_total) - totalPaid);

  const { error } = await db.from("manual_invoices").update({
    payment_status:   newStatus,
    advance_received: totalPaid - balanceDue > 0 ? totalPaid - balanceDue : invoice.advance_received,
    balance_due:      balanceDue,
    payment_method:   body.payment_method   ?? null,
    reference_number: body.reference_number ?? null,
  }).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("manual_invoice_history").insert({
    invoice_id:  id,
    action:      newStatus === "paid" ? "marked_paid" : `status_changed_to_${newStatus}`,
    description: `Invoice ${invoice.invoice_number} marked as ${newStatus}. Amount: ₹${amount}`,
    actor:       "admin",
    metadata:    { amount, payment_method: body.payment_method, reference_number: body.reference_number },
  });

  return NextResponse.json({ updated: true, payment_status: newStatus, balance_due: balanceDue });
}
