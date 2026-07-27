import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paiseToRupees, rupeesToPaise } from "@/lib/finance-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("merchandise_products")
    .select("*, merchandise_variants(*)")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product: { ...data, price_rupees: paiseToRupees(data.price_paise) } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const allowed = ["name","description","sku","category","price_rupees","gst_percentage","image_url","is_active"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) {
      update[k === "price_rupees" ? "price_paise" : k] = k === "price_rupees"
        ? rupeesToPaise(body[k])
        : body[k];
    }
  }

  const db = getSupabaseServer();
  const { data, error } = await db.from("merchandise_products").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ product: { ...data, price_rupees: paiseToRupees(data.price_paise) } });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const db = getSupabaseServer();
  // Soft delete — preserve history in orders
  const { error } = await db.from("merchandise_products").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
