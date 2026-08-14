import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";
import { calcEventDiscount } from "@/lib/commerce/pricing";

// POST /api/admin/events/[id]/register
// Admin-only registration endpoint that bypasses:
//   - Registration deadline (registration_closes_at)
//   - Event capacity limits (optional override)
//   - Event status (can register even for draft events)
// Used for: walk-in participants, offline registrations, corporate groups, late entries.

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `CS-EVT-${s}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json() as {
    email:             string;
    name:              string;
    phone?:            string;
    gender?:           string;
    date_of_birth?:    string;
    blood_group?:      string;
    emergency_contact?: string;
    special_notes?:    string;
    distance_category?: string;
    coupon_code?:      string;
    payment_status?:   "paid" | "free" | "pending"; // admin can force any status
    bypass_capacity?:  boolean;                      // override max_participants
    send_email?:       boolean;                      // default true
    notes?:            string;                       // internal admin notes
  };

  const { email, name } = body;
  if (!email || !name) return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

  const db = getSupabaseServer();

  // Fetch event — no status restriction (admin can register to draft events too)
  const { data: ev } = await db
    .from("events")
    .select("id, title, price, max_participants, participant_count, start_date, start_time, location, distance_categories")
    .eq("id", id)
    .single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Capacity check (unless bypass_capacity=true)
  if (!body.bypass_capacity && ev.max_participants && (ev.participant_count ?? 0) >= ev.max_participants) {
    return NextResponse.json({
      error: "Event is at capacity. Use bypass_capacity=true to register anyway.",
      capacity_full: true,
    }, { status: 409 });
  }

  // Distance category validation
  const cats = (ev.distance_categories ?? []) as string[];
  const chosenCategory: string | null = body.distance_category || (cats.length === 1 ? cats[0] : null);
  if (cats.length > 1 && !chosenCategory) {
    return NextResponse.json({ error: "distance_category required for this event" }, { status: 400 });
  }

  // Coupon validation (same logic as public registration)
  let couponId: string | null = null;
  let discount = 0;
  let discountType = "";
  let discountValue = 0;

  if (body.coupon_code && ev.price > 0) {
    const { data: coupon } = await db
      .from("coupons")
      .select("id, discount_type, discount_value, expires_at, use_count, max_uses, event_id, assigned_to_email")
      .eq("code", body.coupon_code.toUpperCase().trim())
      .single();

    if (!coupon) return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
      return NextResponse.json({ error: "Coupon has expired" }, { status: 400 });
    if (coupon.use_count >= coupon.max_uses)
      return NextResponse.json({ error: "Coupon usage limit reached" }, { status: 400 });
    if (coupon.event_id && coupon.event_id !== id)
      return NextResponse.json({ error: "Coupon not valid for this event" }, { status: 400 });

    couponId     = coupon.id;
    discountType = coupon.discount_type;
    discountValue = coupon.discount_value;
    discount = calcEventDiscount(ev.price, discountType, discountValue);
  }

  const originalPrice = ev.price;
  const finalPrice    = Math.max(0, originalPrice - discount);

  // Determine payment status — admin can force override
  const forcedPayment = body.payment_status;
  const paymentStatus = forcedPayment ?? (finalPrice === 0 ? "free" : "paid");
  const regStatus     = (paymentStatus === "paid" || paymentStatus === "free") ? "confirmed" : "pending_payment";

  const code    = genCode();
  const qrToken = regStatus === "confirmed" ? signEventQR(code, id) : null;

  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .insert({
      registration_code:  code,
      event_id:           id,
      user_email:         email.toLowerCase().trim(),
      user_name:          name.trim(),
      phone:              body.phone              || null,
      gender:             body.gender             || null,
      date_of_birth:      body.date_of_birth      || null,
      blood_group:        body.blood_group         || null,
      emergency_contact:  body.emergency_contact   || null,
      special_notes:      body.special_notes ?? "Admin registration",
      distance_category:  chosenCategory,
      coupon_code:        body.coupon_code?.toUpperCase().trim() || null,
      coupon_id:          couponId,
      coupon_discount:    discount,
      original_price:     originalPrice,
      final_price:        finalPrice,
      payment_status:     paymentStatus,
      status:             regStatus,
      qr_token:           qrToken,
    })
    .select("registration_code, qr_token")
    .single();

  if (regErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const finalCode = reg?.registration_code ?? code;
  const finalQr   = reg?.qr_token          ?? qrToken;

  if (couponId) {
    const { redeemCoupon } = await import("@/lib/coupon-redeem");
    redeemCoupon(couponId, email.toLowerCase()).catch(console.error);
  }

  // Send confirmation email if requested (default: true for confirmed registrations)
  const shouldEmail = (body.send_email !== false) && regStatus === "confirmed" && finalQr;
  if (shouldEmail) {
    after(async () => {
      try {
        const result = await sendEmail(
          email.toLowerCase().trim(),
          name.trim(),
          `Event Registration Confirmed – ${ev.title}`,
          eventRegistrationEmailHTML({
            name, eventTitle: ev.title, startDate: ev.start_date,
            startTime: ev.start_time ?? null, location: ev.location,
            registrationCode: finalCode, distanceCategory: chosenCategory,
            qrToken: finalQr!,
          }),
          false, true,
        );
        await db.from("event_registrations").update({
          email_status:               result.ok ? "sent" : "failed",
          confirmation_email_sent_at: result.ok ? new Date().toISOString() : null,
          email_ses_message_id:       result.messageId ?? null,
          qr_generated_at:            new Date().toISOString(),
        }).eq("registration_code", finalCode);
      } catch (e) {
        console.error("[admin-register] email error:", e);
      }
    });
  }

  return NextResponse.json({
    success:           true,
    registration_code: finalCode,
    payment_status:    paymentStatus,
    status:            regStatus,
    qr_token:          finalQr,
    email_queued:      shouldEmail,
  });
}
