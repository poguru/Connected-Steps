import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, sendWhatsApp, runRegistrationEmailHTML, runRegistrationWAParams } from "@/lib/notify";
import { redeemCoupon } from "@/lib/coupon-redeem";
import { verifyUserToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  // Require a valid user token so anonymous callers cannot trigger coupon
  // redemption or send WhatsApp/email to arbitrary phone numbers.
  const userToken  = req.headers.get("x-user-token");
  const tokenEmail = userToken ? verifyUserToken(userToken) : null;
  if (!tokenEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      event_name, event_date, event_location,
      first_name, last_name, email, phone,
      blood_group, distance,
      emergency_contact_name, emergency_contact_phone,
      is_member, coupon_id,
    } = body;

    if (!first_name || !last_name || !email || !phone || !blood_group || !distance || !emergency_contact_name || !emergency_contact_phone) {
      return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
    }

    // Token email must match registration email
    if (tokenEmail.toLowerCase() !== (email as string).toLowerCase().trim()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getSupabaseServer();

    const { data: existing } = await db
      .from("run_registrations")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .eq("event_date", event_date)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "You have already registered for this event." }, { status: 409 });
    }

    const { error } = await db.from("run_registrations").insert({
      event_name,
      event_date,
      event_location,
      first_name: first_name.trim(),
      last_name:  last_name.trim(),
      email:      email.toLowerCase().trim(),
      phone:      phone.trim(),
      blood_group,
      distance,
      emergency_contact_name:  emergency_contact_name.trim(),
      emergency_contact_phone: emergency_contact_phone.trim(),
      is_member: is_member ?? false,
    });

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    // Atomic coupon redemption: single conditional UPDATE guards max_uses.
    if (coupon_id && email) {
      await redeemCoupon(coupon_id, email.toLowerCase().trim());
    }

    // Fire-and-forget confirmation: email + WhatsApp
    const name = `${first_name.trim()} ${last_name.trim()}`;
    sendEmail(
      email.toLowerCase().trim(),
      name,
      `You're registered for ${event_name} – Connected Steps`,
      runRegistrationEmailHTML(name, event_name, event_date, event_location, distance)
    ).catch(console.error);

    if (phone?.trim()) {
      sendWhatsApp(
        phone.trim(),
        runRegistrationWAParams(name, event_name, event_date, event_location),
        "run_registration"
      ).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
