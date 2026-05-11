import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
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
      is_member,
    } = body;

    // Verify Razorpay signature
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature)
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });

    if (!first_name || !last_name || !email || !phone || !blood_group || !distance || !emergency_contact_name || !emergency_contact_phone)
      return NextResponse.json({ error: "Missing registration fields" }, { status: 400 });

    const db = getSupabaseServer();

    // Check duplicate
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
      amount_paid:              199,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
