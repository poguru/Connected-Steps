import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/manual-invoices
// Query params: q, status, client_type, date_from, date_to, limit, offset
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q          = searchParams.get("q") ?? "";
  const status     = searchParams.get("status") ?? "";
  const clientType = searchParams.get("client_type") ?? "";
  const dateFrom   = searchParams.get("date_from") ?? "";
  const dateTo     = searchParams.get("date_to") ?? "";
  const limit      = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset     = Number(searchParams.get("offset") ?? 0);

  const db = getSupabaseServer();

  let query = db.from("manual_invoices")
    .select(
      "id, invoice_number, invoice_date, due_date, invoice_type, client_type, company_name, client_name, client_email, grand_total, payment_status, created_at, updated_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`invoice_number.ilike.%${q}%,client_name.ilike.%${q}%,company_name.ilike.%${q}%,client_email.ilike.%${q}%`);
  }
  if (status)     query = query.eq("payment_status", status);
  if (clientType) query = query.eq("client_type", clientType);
  if (dateFrom)   query = query.gte("invoice_date", dateFrom);
  if (dateTo)     query = query.lte("invoice_date", dateTo);

  const { data: invoices, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Dashboard stats
  const { data: stats } = await db.from("manual_invoices")
    .select("payment_status, grand_total");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const { data: monthInvoices } = await db.from("manual_invoices")
    .select("grand_total, cgst_amount, sgst_amount, igst_amount")
    .gte("invoice_date", monthStart)
    .in("payment_status", ["sent", "viewed", "partially_paid", "paid"]);

  const summary = {
    total:          (stats ?? []).length,
    draft:          (stats ?? []).filter(i => i.payment_status === "draft").length,
    sent:           (stats ?? []).filter(i => i.payment_status === "sent").length,
    paid:           (stats ?? []).filter(i => i.payment_status === "paid").length,
    pending:        (stats ?? []).filter(i => ["sent","viewed"].includes(i.payment_status)).length,
    overdue:        (stats ?? []).filter(i => i.payment_status === "overdue").length,
    cancelled:      (stats ?? []).filter(i => i.payment_status === "cancelled").length,
    outstanding:    (stats ?? []).filter(i => ["sent","viewed","partially_paid","overdue"].includes(i.payment_status))
                      .reduce((s, i) => s + Number(i.grand_total ?? 0), 0),
    revenue_month:  (monthInvoices ?? []).reduce((s, i) => s + Number(i.grand_total ?? 0), 0),
    gst_month:      (monthInvoices ?? []).reduce((s, i) => s + Number(i.cgst_amount ?? 0) + Number(i.sgst_amount ?? 0) + Number(i.igst_amount ?? 0), 0),
  };

  return NextResponse.json({ invoices: invoices ?? [], total: count ?? 0, summary });
}

// POST /api/admin/manual-invoices
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  if (!body.client_name || typeof body.client_name !== "string") {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  }

  const items = (body.items as Record<string, unknown>[] | undefined) ?? [];

  const invoicePayload = {
    invoice_date:     body.invoice_date     ?? new Date().toISOString().slice(0, 10),
    due_date:         body.due_date         ?? null,
    invoice_type:     body.invoice_type     ?? "tax_invoice",
    currency:         body.currency         ?? "INR",
    place_of_supply:  body.place_of_supply  ?? null,
    is_igst:          body.is_igst === true,
    client_type:      body.client_type      ?? "corporate",
    company_name:     body.company_name     ?? null,
    client_name:      String(body.client_name).trim(),
    client_gst:       body.client_gst       ?? null,
    client_pan:       body.client_pan       ?? null,
    client_email:     body.client_email     ?? null,
    client_phone:     body.client_phone     ?? null,
    billing_address:  body.billing_address  ?? null,
    shipping_address: body.shipping_address ?? null,
    client_state:     body.client_state     ?? null,
    client_country:   body.client_country   ?? "India",
    client_pincode:   body.client_pincode   ?? null,
    subtotal:         Number(body.subtotal        ?? 0),
    discount_amount:  Number(body.discount_amount ?? 0),
    taxable_amount:   Number(body.taxable_amount  ?? 0),
    cgst_amount:      Number(body.cgst_amount     ?? 0),
    sgst_amount:      Number(body.sgst_amount     ?? 0),
    igst_amount:      Number(body.igst_amount     ?? 0),
    round_off:        Number(body.round_off       ?? 0),
    grand_total:      Number(body.grand_total     ?? 0),
    payment_terms:    body.payment_terms    ?? null,
    advance_received: Number(body.advance_received ?? 0),
    balance_due:      Number(body.balance_due     ?? 0),
    payment_status:   "draft",
    payment_method:   body.payment_method   ?? null,
    po_number:        body.po_number        ?? null,
    quotation_ref:    body.quotation_ref    ?? null,
    project_name:     body.project_name     ?? null,
    service_period:   body.service_period   ?? null,
    completion_date:  body.completion_date  ?? null,
    internal_notes:   body.internal_notes   ?? null,
    customer_notes:   body.customer_notes   ?? null,
    terms_conditions: body.terms_conditions ?? null,
    thank_you_message: body.thank_you_message ?? null,
    linked_invoice_id: body.linked_invoice_id ?? null,
    created_by:       "admin",
  };

  // Override invoice_number if provided (admin override)
  if (body.invoice_number && typeof body.invoice_number === "string") {
    // Check uniqueness first
    const { data: exists } = await db.from("manual_invoices")
      .select("id").eq("invoice_number", body.invoice_number).maybeSingle();
    if (exists) return NextResponse.json({ error: "Invoice number already exists" }, { status: 409 });
    Object.assign(invoicePayload, { invoice_number: body.invoice_number });
  }

  const { data: invoice, error } = await db.from("manual_invoices")
    .insert(invoicePayload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert line items
  if (items.length > 0) {
    const itemRows = items.map((it, idx) => ({
      invoice_id:   invoice.id,
      sort_order:   idx,
      description:  String(it.description ?? ""),
      quantity:     Number(it.quantity    ?? 1),
      unit:         it.unit               ?? null,
      rate:         Number(it.rate        ?? 0),
      discount_pct: Number(it.discount_pct ?? 0),
      gst_pct:      Number(it.gst_pct    ?? 18),
      amount:       Number(it.amount      ?? 0),
    }));
    const { error: itemErr } = await db.from("manual_invoice_items").insert(itemRows);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  // History entry
  await db.from("manual_invoice_history").insert({
    invoice_id:  invoice.id,
    action:      "created",
    description: `Invoice ${invoice.invoice_number} created`,
    actor:       "admin",
  });

  return NextResponse.json({ invoice }, { status: 201 });
}
