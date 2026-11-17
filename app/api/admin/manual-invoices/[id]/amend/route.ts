import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/manual-invoices/[id]/amend
// Starts a revision of an invoice that has already been sent. The revision is a NEW draft with its own number, linked to
// the original. The original keeps its number, its status and its items. Paid and cancelled invoices cannot be amended here.
const AMENDABLE = ["sent", "viewed", "partially_paid", "overdue"];

export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const [invRes, itemsRes] = await Promise.all([
    db.from("manual_invoices").select("*").eq("id", id).single(),
    db.from("manual_invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
  ]);
  if (!invRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const src = invRes.data;
  if (src.payment_status === "draft") {
    return NextResponse.json({ error: "A draft is edited directly. Only sent invoices are amended." }, { status: 409 });
  }
  if (!AMENDABLE.includes(src.payment_status)) {
    return NextResponse.json({ error: "Paid and cancelled invoices can't be amended here." }, { status: 409 });
  }

  // One open revision at a time, so amendments can't pile up
  const { data: open } = await db.from("manual_invoices")
    .select("id, invoice_number")
    .eq("amends_invoice_id", id)
    .eq("payment_status", "draft")
    .maybeSingle<{ id: string; invoice_number: string }>();
  if (open) {
    return NextResponse.json({ error: `A revision (${open.invoice_number}) is already in progress for this invoice.`, invoice_id: open.id }, { status: 409 });
  }

  // Copy the content, but never the identity fields: each revision gets its own number, status and links
  const {
    id: _id, invoice_number: _no, created_at: _ca, updated_at: _ua, payment_status: _ps,
    linked_invoice_id: _li, source_quotation_id: _sq, amends_invoice_id: _am, revision_no: _rv,
    ...copyFields
  } = src as Record<string, unknown> & { id: string };

  const { data: revision, error } = await db.from("manual_invoices").insert({
    ...copyFields,
    payment_status:   "draft",
    advance_received: 0,
    balance_due:      src.grand_total,
    reference_number: null,
    amends_invoice_id: src.id,
    revision_no:      (src.revision_no ?? 0) + 1,
    created_by:       "admin",
  }).select().single();
  if (error || !revision) {
    return NextResponse.json({ error: error?.message ?? "Could not start the revision" }, { status: 500 });
  }

  const items = itemsRes.data ?? [];
  if (items.length > 0) {
    const { error: itemErr } = await db.from("manual_invoice_items").insert(items.map(it => ({
      invoice_id:   revision.id,
      sort_order:   it.sort_order,
      description:  it.description,
      quantity:     it.quantity,
      unit:         it.unit,
      rate:         it.rate,
      discount_pct: it.discount_pct,
      gst_pct:      it.gst_pct,
      amount:       it.amount,
    })));
    if (itemErr) {
      await db.from("manual_invoices").delete().eq("id", revision.id);
      return NextResponse.json({ error: "Could not copy the items. No revision was created." }, { status: 500 });
    }
  }

  await db.from("manual_invoice_history").insert([
    { invoice_id: revision.id, action: "created", actor: "admin",
      description: `Revision of invoice ${src.invoice_number}`, metadata: { amends_invoice_id: src.id } },
    { invoice_id: src.id, action: "revision_started", actor: "admin",
      description: `Revision ${revision.invoice_number} started. This invoice is unchanged.`, metadata: { revision_invoice_id: revision.id } },
  ]).then(() => {}, () => {});

  return NextResponse.json({ invoice: revision }, { status: 201 });
}
