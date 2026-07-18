import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/it-run/coupons/validate
// Body: { code, categoryId, amount }
export async function POST(req: NextRequest) {
  try {
    const { code, categoryId, amount } = await req.json() as {
      code: string; categoryId: string; amount: number;
    };

    if (!code || !categoryId) {
      return NextResponse.json({ error: "code and categoryId required" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Get event id from category
    const { data: cat } = await db
      .from("it_run_categories")
      .select("event_id")
      .eq("id", categoryId)
      .single();

    if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    // Find coupon
    const { data: coupon } = await db
      .from("it_run_coupons")
      .select("id,code,description,discount_type,discount_value,max_uses,use_count,min_amount,expires_at,is_active")
      .eq("event_id", cat.event_id)
      .ilike("code", code.trim())
      .single();

    if (!coupon || !coupon.is_active) {
      return NextResponse.json({ error: "Invalid or inactive coupon code" }, { status: 400 });
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: "This coupon has expired" }, { status: 400 });
    }

    if (coupon.max_uses && coupon.use_count >= coupon.max_uses) {
      return NextResponse.json({ error: "This coupon has reached its usage limit" }, { status: 400 });
    }

    if (coupon.min_amount && amount < coupon.min_amount) {
      return NextResponse.json({ error: `This coupon requires a minimum order of Rs.${coupon.min_amount}` }, { status: 400 });
    }

    const discount = coupon.discount_type === "flat"
      ? Math.min(coupon.discount_value, amount)
      : Math.round(amount * coupon.discount_value / 100);

    const label = coupon.discount_type === "flat"
      ? `Rs.${coupon.discount_value} off`
      : `${coupon.discount_value}% off`;

    return NextResponse.json({
      id:       coupon.id,
      code:     coupon.code,
      discount,
      label:    coupon.description ?? label,
    });
  } catch (e: unknown) {
    console.error("[it-run/coupons/validate] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
