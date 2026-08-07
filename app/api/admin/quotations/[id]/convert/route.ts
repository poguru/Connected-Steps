import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/quotations/[id]/convert
// Converts accepted quotation → manual invoice.
// Body: { due_date?: string, notes?: string }
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as { due_date?: string; notes?: string };

  const { data: quo } = await db.from("quotations")
    .select("*")
    .eq("id", id).single();
  if (!quo) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  if (quo.status === "converted") return NextResponse.json({ error: "Already converted" }, { status: 409 });

  const { data: items } = await db.from("quotation_items")
    .select("*").eq("quotation_id", id).order("sort_order");

  // Build manual invoice payload mirroring the quotation data
  const invoicePayload: Record<string, unknown> = {
    payment_status:   "sent",
    client_name:      quo.company_name ? `${quo.company_name} (${quo.client_name})` : quo.client_name,
    client_email:     quo.client_email  ?? null,
    client_phone:     quo.client_phone  ?? null,
    billing_address:  quo.billing_address ?? null,
    client_gst:       quo.client_gst    ?? null,
    place_of_supply:  quo.place_of_supply ?? null,
    is_igst:          quo.is_igst        ?? false,
    notes:            body.notes         ?? quo.customer_notes ?? null,
    due_date:         body.due_date      ?? null,
    subtotal:         quo.subtotal,
    discount_amount:  quo.discount_amount,
    taxable_amount:   quo.taxable_amount,
    cgst_amount:      quo.cgst_amount,
    sgst_amount:      quo.sgst_amount,
    igst_amount:      quo.igst_amount,
    round_off:        quo.round_off,
    grand_total:      quo.grand_total,
    created_by:       "admin",
  };

  const { data: invoice, error: ie } = await db.from("manual_invoices")
    .insert(invoicePayload).select().single();
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });

  // Copy line items
  if ((items ?? []).length > 0) {
    const invoiceItems = (items ?? []).map((it, i) => ({
      invoice_id:   invoice.id,
      sort_order:   i,
      description:  it.description,
      quantity:     it.quantity,
      unit:         it.unit         ?? null,
      rate:         it.rate,
      discount_pct: it.discount_pct ?? 0,
      gst_pct:      it.gst_pct,
      amount:       it.amount,
    }));
    const { error: iie } = await db.from("manual_invoice_items").insert(invoiceItems);
    if (iie) return NextResponse.json({ error: iie.message }, { status: 500 });
  }

  // Mark quotation as converted
  await db.from("quotations").update({
    status:               "converted",
    converted_invoice_id: invoice.id,
    converted_at:         new Date().toISOString(),
    updated_at:           new Date().toISOString(),
  }).eq("id", id);

  await db.from("quotation_status_history").insert({
    quotation_id: id, from_status: quo.status, to_status: "converted", actor: "admin",
  });

  await db.from("quotation_history").insert({
    quotation_id: id,
    action:       "converted",
    description:  `Converted to invoice ${invoice.invoice_number}`,
    actor:        "admin",
    metadata:     { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
  });

  return NextResponse.json({ invoice_id: invoice.id, invoice_number: invoice.invoice_number }, { status: 201 });
}
