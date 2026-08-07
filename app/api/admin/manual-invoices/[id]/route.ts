import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { invalidatePdf } from "@/lib/pdf-generator";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/manual-invoices/[id]
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const [invRes, itemsRes, histRes, emailRes, payRes] = await Promise.all([
    db.from("manual_invoices").select("*").eq("id", id).single(),
    db.from("manual_invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    db.from("manual_invoice_history").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    db.from("manual_invoice_email_logs").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    db.from("manual_invoice_payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
  ]);

  if (invRes.error || !invRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    invoice:  invRes.data,
    items:    itemsRes.data  ?? [],
    history:  histRes.data   ?? [],
    emails:   emailRes.data  ?? [],
    payments: payRes.data    ?? [],
  });
}

// PUT /api/admin/manual-invoices/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  // Only drafts can be edited
  const { data: current } = await db.from("manual_invoices")
    .select("payment_status, invoice_number").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["draft"].includes(current.payment_status)) {
    return NextResponse.json({ error: "Only draft invoices can be edited" }, { status: 409 });
  }

  const items = (body.items as Record<string, unknown>[] | undefined) ?? [];

  const updatePayload = {
    invoice_date:      body.invoice_date      ?? undefined,
    due_date:          body.due_date          ?? null,
    invoice_type:      body.invoice_type      ?? undefined,
    currency:          body.currency          ?? undefined,
    place_of_supply:   body.place_of_supply   ?? null,
    is_igst:           body.is_igst === true,
    client_type:       body.client_type       ?? undefined,
    company_name:      body.company_name      ?? null,
    client_name:       body.client_name       ? String(body.client_name).trim() : undefined,
    client_gst:        body.client_gst        ?? null,
    client_pan:        body.client_pan        ?? null,
    client_email:      body.client_email      ?? null,
    client_phone:      body.client_phone      ?? null,
    billing_address:   body.billing_address   ?? null,
    shipping_address:  body.shipping_address  ?? null,
    client_state:      body.client_state      ?? null,
    client_country:    body.client_country    ?? undefined,
    client_pincode:    body.client_pincode    ?? null,
    subtotal:          Number(body.subtotal        ?? 0),
    discount_amount:   Number(body.discount_amount ?? 0),
    taxable_amount:    Number(body.taxable_amount  ?? 0),
    cgst_amount:       Number(body.cgst_amount     ?? 0),
    sgst_amount:       Number(body.sgst_amount     ?? 0),
    igst_amount:       Number(body.igst_amount     ?? 0),
    round_off:         Number(body.round_off       ?? 0),
    grand_total:       Number(body.grand_total     ?? 0),
    payment_terms:     body.payment_terms     ?? null,
    advance_received:  Number(body.advance_received ?? 0),
    balance_due:       Number(body.balance_due     ?? 0),
    payment_method:    body.payment_method    ?? null,
    po_number:         body.po_number         ?? null,
    quotation_ref:     body.quotation_ref     ?? null,
    project_name:      body.project_name      ?? null,
    service_period:    body.service_period    ?? null,
    completion_date:   body.completion_date   ?? null,
    internal_notes:    body.internal_notes    ?? null,
    customer_notes:    body.customer_notes    ?? null,
    terms_conditions:  body.terms_conditions  ?? null,
    thank_you_message: body.thank_you_message ?? null,
  };

  const { data: invoice, error } = await db.from("manual_invoices")
    .update(updatePayload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Replace line items
  await db.from("manual_invoice_items").delete().eq("invoice_id", id);
  if (items.length > 0) {
    const itemRows = items.map((it, idx) => ({
      invoice_id:   id,
      sort_order:   idx,
      description:  String(it.description ?? ""),
      quantity:     Number(it.quantity    ?? 1),
      unit:         it.unit               ?? null,
      rate:         Number(it.rate        ?? 0),
      discount_pct: Number(it.discount_pct ?? 0),
      gst_pct:      Number(it.gst_pct    ?? 18),
      amount:       Number(it.amount      ?? 0),
    }));
    await db.from("manual_invoice_items").insert(itemRows);
  }

  await db.from("manual_invoice_history").insert({
    invoice_id:  id,
    action:      "updated",
    description: `Invoice ${current.invoice_number} updated`,
    actor:       "admin",
  });

  // Invalidate cached PDF so next download reflects the latest changes
  invalidatePdf(db, `manual-invoices/${id}.pdf`);

  return NextResponse.json({ invoice });
}

// DELETE /api/admin/manual-invoices/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data: current } = await db.from("manual_invoices")
    .select("payment_status, invoice_number").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["draft", "cancelled"].includes(current.payment_status)) {
    return NextResponse.json({ error: "Only draft or cancelled invoices can be deleted" }, { status: 409 });
  }

  const { error } = await db.from("manual_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
