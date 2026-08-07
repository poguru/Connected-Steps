import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/quotations/[id]/duplicate
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: src } = await db.from("quotations").select("*").eq("id", id).single();
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: srcItems } = await db.from("quotation_items")
    .select("*").eq("quotation_id", id).order("sort_order");

  const { id: _id, quotation_number: _qn, created_at: _ca, updated_at: _ua,
          converted_invoice_id: _ci, converted_at: _coa, ...rest } = src;

  const newPayload = {
    ...rest,
    version:    1,
    status:     "draft",
    created_by: "admin",
  };

  const { data: newQuo, error } = await db.from("quotations").insert(newPayload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if ((srcItems ?? []).length > 0) {
    const newItems = (srcItems ?? []).map((it) => {
      const { id: _iid, quotation_id: _qid, created_at: _ica, ...irest } = it;
      return { ...irest, quotation_id: newQuo.id };
    });
    await db.from("quotation_items").insert(newItems);
  }

  await db.from("quotation_history").insert({
    quotation_id: newQuo.id,
    action:       "created",
    description:  `Duplicated from ${src.quotation_number}`,
    actor:        "admin",
    metadata:     { source_id: id },
  });

  await db.from("quotation_status_history").insert({
    quotation_id: newQuo.id, from_status: null, to_status: "draft", actor: "admin",
  });

  return NextResponse.json({ quotation: newQuo }, { status: 201 });
}
