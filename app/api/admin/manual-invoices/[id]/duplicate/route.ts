import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/manual-invoices/[id]/duplicate
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

  // Create new invoice (new number, reset payment status to draft)
  const { id: _id, invoice_number: _inv, created_at: _ca, updated_at: _ua,
          payment_status: _ps, linked_invoice_id: _li, ...copyFields } = src;

  const { data: newInv, error } = await db.from("manual_invoices").insert({
    ...copyFields,
    invoice_date:    new Date().toISOString().slice(0, 10),
    due_date:        null,
    payment_status:  "draft",
    advance_received: 0,
    balance_due:     src.grand_total,
    reference_number: null,
    created_by:      "admin",
  }).select().single();

  if (error || !newInv) return NextResponse.json({ error: error?.message ?? "Duplicate failed" }, { status: 500 });

  // Copy line items
  const items = itemsRes.data ?? [];
  if (items.length > 0) {
    const itemRows = items.map(it => ({
      invoice_id:   newInv.id,
      sort_order:   it.sort_order,
      description:  it.description,
      quantity:     it.quantity,
      unit:         it.unit,
      rate:         it.rate,
      discount_pct: it.discount_pct,
      gst_pct:      it.gst_pct,
      amount:       it.amount,
    }));
    await db.from("manual_invoice_items").insert(itemRows);
  }

  await db.from("manual_invoice_history").insert({
    invoice_id:  newInv.id,
    action:      "created",
    description: `Duplicated from invoice ${src.invoice_number}`,
    actor:       "admin",
    metadata:    { source_invoice_id: id },
  });

  return NextResponse.json({ invoice: newInv }, { status: 201 });
}
