import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyPaymentSignature } from "@/lib/razorpay-security";
import { redeemCoupon } from "@/lib/coupon-redeem";
import { verifyUserToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  // Require a valid user session — prevents anonymous coupon redemption
  // and registration under arbitrary email addresses.
  const userToken  = req.headers.get("x-user-token");
  const tokenEmail = userToken ? verifyUserToken(userToken) : null;
  if (!tokenEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      event_name, event_date, event_location,
      first_name, last_name, email, phone,
      blood_group, distance,
      emergency_contact_name, emergency_contact_phone,
      is_member, coupon_id, amount_paid,
    } = body;

    // Verify Razorpay signature
    let sigValid: boolean;
    try { sigValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature); } catch { sigValid = false; }
    if (!sigValid) return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });

    if (!first_name || !last_name || !email || !phone || !blood_group || !distance || !emergency_contact_name || !emergency_contact_phone)
      return NextResponse.json({ error: "Missing registration fields" }, { status: 400 });

    const db = getSupabaseServer();

    // Idempotency guard: if this razorpay_payment_id was already recorded,
    // return success immediately without touching any data.  This handles
    // Razorpay webhook retries (which fire a second POST when the first
    // request times out) and prevents duplicate run_registration rows.
    const { data: alreadyProcessed } = await db
      .from("run_registrations")
      .select("id")
      .eq("razorpay_payment_id", razorpay_payment_id)
      .maybeSingle();

    if (alreadyProcessed) {
      return NextResponse.json({ success: true });
    }

    // Check duplicate by email + event (belt-and-suspenders against other entry paths)
    const { data: existing } = await db
      .from("run_registrations")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .eq("event_date", event_date)
      .limit(1);

    if (existing && existing.length > 0)
      return NextResponse.json({ error: "You have already registered for this event." }, { status: 409 });

    const { error } = await db.from("run_registrations").insert({
      event_name,
      event_date,
      event_location,
      first_name:               first_name.trim(),
      last_name:                last_name.trim(),
      email:                    email.toLowerCase().trim(),
      phone:                    phone.trim(),
      blood_group,
      distance,
      emergency_contact_name:   emergency_contact_name.trim(),
      emergency_contact_phone:  emergency_contact_phone.trim(),
      is_member:                is_member ?? false,
      razorpay_payment_id,
      amount_paid:              typeof amount_paid === "number" ? amount_paid : 199,
    });

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    // Atomic coupon redemption: single conditional UPDATE guards max_uses.
    if (coupon_id && email) {
      await redeemCoupon(coupon_id, email.toLowerCase().trim());
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
