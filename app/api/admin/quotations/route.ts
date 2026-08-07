import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/quotations
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q      = searchParams.get("q")      ?? "";
  const status = searchParams.get("status") ?? "";
  const limit  = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const db = getSupabaseServer();

  let query = db.from("quotations")
    .select(
      "id, quotation_number, version, status, company_name, client_name, client_email, proposal_title, event_date, valid_until, grand_total, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q)      query = query.or(`quotation_number.ilike.%${q}%,client_name.ilike.%${q}%,company_name.ilike.%${q}%,proposal_title.ilike.%${q}%`);
  if (status) query = query.eq("status", status);

  const { data: quotations, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Dashboard stats (all-time)
  const { data: all } = await db.from("quotations").select("status, grand_total");
  const stats = {
    total:           (all ?? []).length,
    draft:           (all ?? []).filter(r => r.status === "draft").length,
    sent:            (all ?? []).filter(r => r.status === "sent").length,
    viewed:          (all ?? []).filter(r => r.status === "viewed").length,
    accepted:        (all ?? []).filter(r => r.status === "accepted").length,
    rejected:        (all ?? []).filter(r => r.status === "rejected").length,
    expired:         (all ?? []).filter(r => r.status === "expired").length,
    converted:       (all ?? []).filter(r => r.status === "converted").length,
    total_value:     (all ?? []).reduce((s, r) => s + Number(r.grand_total ?? 0), 0),
    accepted_value:  (all ?? []).filter(r => ["accepted","converted"].includes(r.status)).reduce((s, r) => s + Number(r.grand_total ?? 0), 0),
    conversion_rate: (all ?? []).length === 0 ? 0 : Math.round(
      ((all ?? []).filter(r => ["accepted","converted"].includes(r.status)).length /
      Math.max(1, (all ?? []).filter(r => r.status !== "draft").length)) * 100
    ),
  };

  // Load templates for the "create" dropdown
  const { data: templates } = await db.from("quotation_templates")
    .select("id, name, category")
    .order("name");

  return NextResponse.json({ quotations: quotations ?? [], total: count ?? 0, stats, templates: templates ?? [] });
}

// POST /api/admin/quotations
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  const items = (body.items as Record<string, unknown>[] | undefined) ?? [];

  const payload: Record<string, unknown> = {
    version:           1,
    status:            "draft",
    company_name:      body.company_name      ?? null,
    client_name:       String(body.client_name ?? "").trim(),
    client_designation: body.client_designation ?? null,
    client_department: body.client_department  ?? null,
    client_gst:        body.client_gst         ?? null,
    client_pan:        body.client_pan         ?? null,
    client_email:      body.client_email        ?? null,
    client_phone:      body.client_phone        ?? null,
    billing_address:   body.billing_address     ?? null,
    project_location:  body.project_location    ?? null,
    client_website:    body.client_website      ?? null,
    proposal_title:    String(body.proposal_title ?? "").trim(),
    project_name:      body.project_name        ?? null,
    event_date:        body.event_date          ?? null,
    valid_until:       body.valid_until         ?? null,
    prepared_by:       body.prepared_by         ?? null,
    reference_number:  body.reference_number    ?? null,
    executive_summary: body.executive_summary   ?? null,
    scope_of_work:     body.scope_of_work       ?? null,
    terms_conditions:  body.terms_conditions    ?? null,
    payment_terms_notes: body.payment_terms_notes ?? null,
    deliverables:       body.deliverables        ?? [],
    sponsorship_packages: body.sponsorship_packages ?? [],
    timeline_milestones: body.timeline_milestones ?? [],
    payment_milestones: body.payment_milestones  ?? [],
    currency:          body.currency             ?? "INR",
    place_of_supply:   body.place_of_supply      ?? null,
    is_igst:           body.is_igst === true,
    advance_percentage: body.advance_percentage  ?? null,
    subtotal:          Number(body.subtotal         ?? 0),
    discount_amount:   Number(body.discount_amount  ?? 0),
    taxable_amount:    Number(body.taxable_amount   ?? 0),
    cgst_amount:       Number(body.cgst_amount      ?? 0),
    sgst_amount:       Number(body.sgst_amount      ?? 0),
    igst_amount:       Number(body.igst_amount      ?? 0),
    round_off:         Number(body.round_off        ?? 0),
    grand_total:       Number(body.grand_total      ?? 0),
    internal_notes:    body.internal_notes          ?? null,
    customer_notes:    body.customer_notes          ?? null,
    template_id:       body.template_id             ?? null,
    created_by:        "admin",
  };

  // Manual number override
  if (body.quotation_number && typeof body.quotation_number === "string") {
    const { data: exists } = await db.from("quotations")
      .select("id").eq("quotation_number", body.quotation_number).maybeSingle();
    if (exists) return NextResponse.json({ error: "Quotation number already exists" }, { status: 409 });
    payload.quotation_number = body.quotation_number;
  }

  const { data: quo, error } = await db.from("quotations").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Line items
  if (items.length > 0) {
    const rows = items.map((it, i) => ({
      quotation_id:  quo.id,
      sort_order:    i,
      description:   String(it.description ?? ""),
      quantity:      Number(it.quantity    ?? 1),
      unit:          it.unit               ?? null,
      rate:          Number(it.rate        ?? 0),
      discount_pct:  Number(it.discount_pct ?? 0),
      gst_pct:       Number(it.gst_pct    ?? 18),
      amount:        Number(it.amount      ?? 0),
    }));
    const { error: ie } = await db.from("quotation_items").insert(rows);
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
  }

  // Audit
  await db.from("quotation_history").insert({
    quotation_id: quo.id,
    action:       "created",
    description:  `Quotation ${quo.quotation_number} created`,
    actor:        "admin",
  });

  await db.from("quotation_status_history").insert({
    quotation_id: quo.id,
    from_status:  null,
    to_status:    "draft",
    actor:        "admin",
  });

  return NextResponse.json({ quotation: quo }, { status: 201 });
}
