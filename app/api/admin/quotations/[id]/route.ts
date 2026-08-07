import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { invalidatePdf } from "@/lib/pdf-generator";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/quotations/[id]
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: quo, error } = await db.from("quotations").select("*").eq("id", id).single();
  if (error || !quo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: items }, { data: history }, { data: emails }, { data: statusHistory }] = await Promise.all([
    db.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order"),
    db.from("quotation_history").select("*").eq("quotation_id", id).order("created_at", { ascending: false }),
    db.from("quotation_email_logs").select("*").eq("quotation_id", id).order("created_at", { ascending: false }),
    db.from("quotation_status_history").select("*").eq("quotation_id", id).order("changed_at", { ascending: false }),
  ]);

  return NextResponse.json({
    quotation:     quo,
    items:         items         ?? [],
    history:       history       ?? [],
    emails:        emails        ?? [],
    statusHistory: statusHistory ?? [],
  });
}

// PUT /api/admin/quotations/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  const { data: existing } = await db.from("quotations").select("id, status, version, quotation_number").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "converted") return NextResponse.json({ error: "Cannot edit a converted quotation" }, { status: 409 });

  const items = (body.items as Record<string, unknown>[] | undefined) ?? [];

  // Bump version on every save for full traceability
  const newVersion = (existing.version ?? 1) + 1;

  const patch: Record<string, unknown> = {
    version:             newVersion,
    company_name:        body.company_name         ?? null,
    client_name:         String(body.client_name   ?? "").trim(),
    client_designation:  body.client_designation   ?? null,
    client_department:   body.client_department    ?? null,
    client_gst:          body.client_gst           ?? null,
    client_pan:          body.client_pan           ?? null,
    client_email:        body.client_email         ?? null,
    client_phone:        body.client_phone         ?? null,
    billing_address:     body.billing_address      ?? null,
    project_location:    body.project_location     ?? null,
    client_website:      body.client_website       ?? null,
    proposal_title:      String(body.proposal_title ?? "").trim(),
    project_name:        body.project_name         ?? null,
    event_date:          body.event_date           ?? null,
    valid_until:         body.valid_until          ?? null,
    prepared_by:         body.prepared_by          ?? null,
    reference_number:    body.reference_number     ?? null,
    executive_summary:   body.executive_summary    ?? null,
    scope_of_work:       body.scope_of_work        ?? null,
    terms_conditions:    body.terms_conditions     ?? null,
    payment_terms_notes: body.payment_terms_notes  ?? null,
    deliverables:        body.deliverables         ?? [],
    sponsorship_packages: body.sponsorship_packages ?? [],
    timeline_milestones: body.timeline_milestones  ?? [],
    payment_milestones:  body.payment_milestones   ?? [],
    currency:            body.currency             ?? "INR",
    place_of_supply:     body.place_of_supply      ?? null,
    is_igst:             body.is_igst === true,
    advance_percentage:  body.advance_percentage   ?? null,
    subtotal:            Number(body.subtotal       ?? 0),
    discount_amount:     Number(body.discount_amount ?? 0),
    taxable_amount:      Number(body.taxable_amount ?? 0),
    cgst_amount:         Number(body.cgst_amount   ?? 0),
    sgst_amount:         Number(body.sgst_amount   ?? 0),
    igst_amount:         Number(body.igst_amount   ?? 0),
    round_off:           Number(body.round_off     ?? 0),
    grand_total:         Number(body.grand_total   ?? 0),
    internal_notes:      body.internal_notes       ?? null,
    customer_notes:      body.customer_notes       ?? null,
    updated_at:          new Date().toISOString(),
  };

  const { data: updated, error } = await db.from("quotations").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Replace all line items
  await db.from("quotation_items").delete().eq("quotation_id", id);
  if (items.length > 0) {
    const rows = items.map((it, i) => ({
      quotation_id: id,
      sort_order:   i,
      description:  String(it.description ?? ""),
      quantity:     Number(it.quantity    ?? 1),
      unit:         it.unit               ?? null,
      rate:         Number(it.rate        ?? 0),
      discount_pct: Number(it.discount_pct ?? 0),
      gst_pct:      Number(it.gst_pct    ?? 18),
      amount:       Number(it.amount      ?? 0),
    }));
    const { error: ie } = await db.from("quotation_items").insert(rows);
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
  }

  await db.from("quotation_history").insert({
    quotation_id: id,
    action:       "updated",
    description:  `Quotation ${existing.quotation_number} updated to v${newVersion}`,
    actor:        "admin",
  });

  // Invalidate cached PDF so next download reflects the latest changes
  invalidatePdf(db, `quotations/${id}.pdf`);

  return NextResponse.json({ quotation: updated });
}

// DELETE /api/admin/quotations/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: existing } = await db.from("quotations").select("status, quotation_number").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "converted") return NextResponse.json({ error: "Cannot delete a converted quotation" }, { status: 409 });

  const { error } = await db.from("quotations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
