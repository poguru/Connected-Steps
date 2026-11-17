import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/quotations/[id]/convert
// Converts an ACCEPTED quotation into a draft manual invoice. The quotation is claimed first, in one conditional update,
// so two simultaneous requests cannot both convert it. If a later step fails, the claim and the new invoice are undone.
// Body: { due_date?: string, notes?: string }
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json().catch(() => ({})) as { due_date?: string; notes?: string };
  const now  = new Date().toISOString();

  // Claim: only an accepted quotation can move to converted, and only one request can do it
  const { data: quo, error: claimErr } = await db.from("quotations")
    .update({ status: "converted", updated_at: now })
    .eq("id", id)
    .eq("status", "accepted")
    .select("*")
    .maybeSingle();
  if (claimErr) return NextResponse.json({ error: "Could not convert the quotation. Please try again." }, { status: 500 });

  if (!quo) {
    const { data: current } = await db.from("quotations")
      .select("status, converted_invoice_id").eq("id", id).maybeSingle<{ status: string; converted_invoice_id: string | null }>();
    if (!current) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    if (current.status === "converted") {
      return NextResponse.json({ error: "This quotation has already been converted", invoice_id: current.converted_invoice_id }, { status: 409 });
    }
    return NextResponse.json({ error: "Only an accepted quotation can be converted to an invoice" }, { status: 409 });
  }

  // Undoes everything this request did, so a failure never leaves an invoice without its items or a quotation stuck as converted
  let invoiceId: string | null = null;
  const release = async () => {
    if (invoiceId) await db.from("manual_invoices").delete().eq("id", invoiceId);
    await db.from("quotations")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "converted").is("converted_invoice_id", null);
  };

  const { data: items, error: itemsErr } = await db.from("quotation_items")
    .select("*").eq("quotation_id", id).order("sort_order");
  if (itemsErr) {
    await release();
    return NextResponse.json({ error: "Could not read the quotation items. Please try again." }, { status: 500 });
  }

  // The invoice starts as a draft: nothing has been sent, so it must not look sent
  const invoicePayload: Record<string, unknown> = {
    payment_status:      "draft",
    source_quotation_id: quo.id,
    client_name:         quo.company_name ? `${quo.company_name} (${quo.client_name})` : quo.client_name,
    client_email:        quo.client_email  ?? null,
    client_phone:        quo.client_phone  ?? null,
    billing_address:     quo.billing_address ?? null,
    client_gst:          quo.client_gst    ?? null,
    place_of_supply:     quo.place_of_supply ?? null,
    is_igst:             quo.is_igst        ?? false,
    notes:               body.notes         ?? quo.customer_notes ?? null,
    due_date:            body.due_date      ?? null,
    subtotal:            quo.subtotal,
    discount_amount:     quo.discount_amount,
    taxable_amount:      quo.taxable_amount,
    cgst_amount:         quo.cgst_amount,
    sgst_amount:         quo.sgst_amount,
    igst_amount:         quo.igst_amount,
    round_off:           quo.round_off,
    grand_total:         quo.grand_total,
    balance_due:         quo.grand_total,
    created_by:          "admin",
  };

  const { data: invoice, error: ie } = await db.from("manual_invoices")
    .insert(invoicePayload).select().single();
  if (ie || !invoice) {
    await release();
    return NextResponse.json({ error: "Could not create the invoice. The quotation was not changed." }, { status: 500 });
  }
  invoiceId = invoice.id;

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
    if (iie) {
      await release();
      return NextResponse.json({ error: "Could not copy the items. The quotation was not changed." }, { status: 500 });
    }
  }

  // Link the quotation to its invoice. The status was already set by the claim above.
  const { error: linkErr } = await db.from("quotations").update({
    converted_invoice_id: invoice.id,
    converted_at:         now,
    updated_at:           now,
  }).eq("id", id);
  if (linkErr) {
    await release();
    return NextResponse.json({ error: "Could not link the invoice. The quotation was not changed." }, { status: 500 });
  }

  // History is a record, not part of the conversion, so a failure here does not undo it
  await db.from("quotation_status_history").insert({
    quotation_id: id, from_status: "accepted", to_status: "converted", actor: "admin",
  }).then(() => {}, () => {});
  await db.from("quotation_history").insert({
    quotation_id: id,
    action:       "converted",
    description:  `Converted to invoice ${invoice.invoice_number}`,
    actor:        "admin",
    metadata:     { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
  }).then(() => {}, () => {});

  return NextResponse.json({ invoice_id: invoice.id, invoice_number: invoice.invoice_number }, { status: 201 });
}
