import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { code, email, event_id } = await req.json();
    if (!code) return NextResponse.json({ error: "Enter a coupon code." }, { status: 400 });

    const db = getSupabaseServer();

    const { data: coupon, error } = await db
      .from("coupons")
      .select("*")
      .eq("code", code.toUpperCase().trim())
      .single();

    if (error || !coupon) return NextResponse.json({ error: "Invalid coupon code." }, { status: 404 });

    // Expiry check
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
      return NextResponse.json({ error: "This coupon has expired." }, { status: 410 });

    // Max uses check
    if (coupon.use_count >= coupon.max_uses)
      return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 410 });

    // Event restriction check
    if (coupon.event_id && event_id && coupon.event_id !== event_id)
      return NextResponse.json({ error: "This coupon is not valid for this event." }, { status: 400 });

    // Assigned-to-email check
    if (coupon.assigned_to_email && email &&
      coupon.assigned_to_email.toLowerCase() !== email.toLowerCase())
      return NextResponse.json({ error: "This coupon is not assigned to your account." }, { status: 403 });

    // Already used by this user?
    if (email) {
      const { data: uses } = await db
        .from("coupon_uses")
        .select("id")
        .eq("coupon_id", coupon.id)
        .eq("used_by_email", email.toLowerCase())
        .limit(1);
      if (uses && uses.length > 0)
        return NextResponse.json({ error: "You have already used this coupon." }, { status: 409 });
    }

    return NextResponse.json({
      valid: true,
      coupon_id: coupon.id,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      description: coupon.description,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
