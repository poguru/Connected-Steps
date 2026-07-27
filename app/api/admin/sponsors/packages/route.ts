import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paiseToRupees, rupeesToPaise } from "@/lib/finance-service";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const org_id = searchParams.get("org_id") ?? undefined;

  const db = getSupabaseServer();
  let q = db.from("sponsor_packages").select("*").order("display_order").order("name");
  if (org_id) q = q.eq("organization_id", org_id) as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const packages = (data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    price_rupees: paiseToRupees(p.price_paise as number ?? 0),
  }));

  return NextResponse.json({ packages });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organization_id, name, description, price_rupees, deliverables = [], display_order = 0 } = body;

  if (!organization_id || !name) {
    return NextResponse.json({ error: "organization_id and name are required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db.from("sponsor_packages").insert({
    organization_id,
    name,
    description:   description ?? null,
    price_paise:   rupeesToPaise(price_rupees ?? 0),
    deliverables,
    is_active:     true,
    display_order,
  }).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ package: { ...data, price_rupees: paiseToRupees(data.price_paise) } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, name, description, price_rupees, deliverables, is_active, display_order } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (name          !== undefined) update.name          = name;
  if (description   !== undefined) update.description   = description;
  if (price_rupees  !== undefined) update.price_paise   = rupeesToPaise(price_rupees);
  if (deliverables  !== undefined) update.deliverables  = deliverables;
  if (is_active     !== undefined) update.is_active     = is_active;
  if (display_order !== undefined) update.display_order = display_order;

  const db = getSupabaseServer();
  const { data, error } = await db.from("sponsor_packages").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ package: { ...data, price_rupees: paiseToRupees(data.price_paise) } });
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.from("sponsor_packages").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
