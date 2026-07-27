import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paiseToRupees, rupeesToPaise } from "@/lib/finance-service";

const VALID_CATEGORIES = ["tshirt", "medal", "bib", "nutrition", "accessory", "other"] as const;

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const org_id   = searchParams.get("org_id")   ?? undefined;
  const event_id = searchParams.get("event_id") ?? undefined;
  const category = searchParams.get("category") ?? undefined;

  const db = getSupabaseServer();
  let q = db
    .from("merchandise_products")
    .select("*, merchandise_variants(id, variant_name, variant_type, sku, price_override, stock_qty, reserved_qty, sold_qty, display_order)")
    .order("name");

  if (org_id)   q = q.eq("organization_id", org_id) as typeof q;
  if (event_id) q = q.eq("event_id", event_id) as typeof q;
  if (category) q = q.eq("category", category) as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const products = (data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    price_rupees: paiseToRupees(p.price_paise as number ?? 0),
  }));

  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    organization_id, event_id,
    name, description, sku, category = "other",
    price_rupees, gst_percentage = 0, image_url,
    variants = [],
  } = body;

  if (!organization_id || !name || price_rupees == null) {
    return NextResponse.json({ error: "organization_id, name, price_rupees are required" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: product, error: prodErr } = await db.from("merchandise_products").insert({
    organization_id,
    event_id:       event_id ?? null,
    name,
    description:    description ?? null,
    sku:            sku ?? null,
    category,
    price_paise:    rupeesToPaise(price_rupees),
    gst_percentage,
    image_url:      image_url ?? null,
    is_active:      true,
  }).select().single();

  if (prodErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Insert variants if provided
  if (variants.length > 0) {
    const variantRows = variants.map((v: { variant_name: string; variant_type?: string; sku?: string; price_override_rupees?: number; stock_qty?: number }, i: number) => ({
      product_id:     product.id,
      variant_name:   v.variant_name,
      variant_type:   v.variant_type ?? "size",
      sku:            v.sku ?? null,
      price_override: v.price_override_rupees != null ? rupeesToPaise(v.price_override_rupees) : null,
      stock_qty:      v.stock_qty ?? 0,
      display_order:  i,
    }));
    await db.from("merchandise_variants").insert(variantRows);
  }

  return NextResponse.json({ product: { ...product, price_rupees } }, { status: 201 });
}
