import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `CS-EVT-${s}`;
}

function calcDiscount(price: number, type: string, value: number): number {
  if (type === "percentage") return Math.min(price, Math.round(price * value / 100));
  if (type === "fixed")      return Math.min(price, value);
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    // Require a valid user session token
    const token = req.headers.get("x-user-token");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tokenEmail = verifyUserToken(token);
    if (!tokenEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      event_id, email, name, phone, gender, date_of_birth,
      blood_group, emergency_contact, special_notes, coupon_code,
      distance_category,
    } = await req.json();

    if (!event_id || !email || !name) {
      return NextResponse.json({ error: "event_id, email, and name are required." }, { status: 400 });
    }

    // Ensure the caller can only register for their own email
    if (tokenEmail.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Backend field validation
    const errs: string[] = [];
    if (!name || name.trim().length < 3)           errs.push("Full name must be at least 3 characters.");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push("Valid email is required.");
    if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ""))) errs.push("Phone must be exactly 10 digits.");
    if (!gender)                                    errs.push("Gender is required.");
    if (!date_of_birth)                             errs.push("Date of birth is required.");
    if (date_of_birth && new Date(date_of_birth) >= new Date()) errs.push("Date of birth must be in the past.");
    if (!blood_group)                               errs.push("Blood group is required.");
    if (!emergency_contact)                         errs.push("Emergency contact is required.");
    if (!special_notes || !special_notes.trim())    errs.push("Special notes are required (enter NA if none).");
    if (errs.length > 0) return NextResponse.json({ error: errs[0] }, { status: 400 });

    const db = getSupabaseServer();

    // ── Verify user ────────────────────────────────────────────────────────────
    const { data: user } = await db
      .from("users")
      .select("email, first_name, last_name")
      .eq("email", email.toLowerCase().trim())
      .single();
    if (!user) return NextResponse.json({ error: "Account not found. Please sign up first." }, { status: 404 });

    // ── Verify event ───────────────────────────────────────────────────────────
    const { data: ev } = await db
      .from("events")
      .select("id, title, price, max_participants, participant_count, start_date, start_time, end_date, end_time, registration_closes_at, location, status, distance_categories")
      .eq("id", event_id)
      .single();
    if (!ev || ev.status !== "published") {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    // ── Registration deadline enforcement (IST-aware) ──────────────────────────
    if (ev.registration_closes_at && new Date() >= new Date(ev.registration_closes_at)) {
      return NextResponse.json({ error: "Registration for this event is now closed." }, { status: 403 });
    }
    // Also block if event has already started or ended
    const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const today   = istNow.toISOString().split("T")[0];
    const nowTime = istNow.toTimeString().substring(0, 5);
    const endDate = ev.end_date ?? ev.start_date;
    const endTime = (ev.end_time ?? "23:59").substring(0, 5);
    if (endDate < today || (endDate === today && endTime <= nowTime)) {
      return NextResponse.json({ error: "This event has already ended." }, { status: 403 });
    }

    // ── Distance category validation ──────────────────────────────────────────
    const cats = (ev as { distance_categories?: string[] }).distance_categories ?? [];
    if (cats.length > 1 && !distance_category) {
      return NextResponse.json({ error: "Please select a distance category." }, { status: 400 });
    }
    if (distance_category && cats.length > 0 && !cats.includes(distance_category)) {
      return NextResponse.json({ error: "Invalid distance category for this event." }, { status: 400 });
    }
    const chosenCategory: string | null = cats.length > 0 ? (distance_category || cats[0]) : null;

    // ── Atomic slot check — uses participant_count maintained by DB trigger ────
    // participant_count is incremented by the trigger on INSERT/UPDATE status='confirmed'.
    // We still gate here as a fast early-exit; the trigger is the ground truth.
    if (ev.max_participants && (ev.participant_count ?? 0) >= ev.max_participants) {
      return NextResponse.json({ error: "This event is fully booked." }, { status: 409 });
    }

    // ── Duplicate check ────────────────────────────────────────────────────────
    const { data: existing } = await db
      .from("event_registrations")
      .select("id, registration_code, payment_status")
      .eq("event_id", event_id)
      .eq("user_email", email.toLowerCase().trim())
      .maybeSingle();
    // If already confirmed (free or paid), return existing code
    if (existing && (existing.payment_status === "free" || existing.payment_status === "paid")) {
      return NextResponse.json({ already: true, registration_code: existing.registration_code });
    }
    // If pending payment, allow them to re-attempt payment (fall through to paid flow below)

    // ── Coupon validation ──────────────────────────────────────────────────────
    let couponId: string | null = null;
    let discount   = 0;
    let discountType = "";
    let discountValue = 0;

    if (coupon_code && ev.price > 0) {
      const { data: coupon, error: cpErr } = await db
        .from("coupons")
        .select("id, discount_type, discount_value, expires_at, use_count, max_uses, event_id, assigned_to_email")
        .eq("code", coupon_code.toUpperCase().trim())
        .single();

      if (cpErr || !coupon) {
        return NextResponse.json({ error: "Invalid coupon code." }, { status: 400 });
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return NextResponse.json({ error: "This coupon has expired." }, { status: 400 });
      }
      if (coupon.use_count >= coupon.max_uses) {
        return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 400 });
      }
      if (coupon.event_id && coupon.event_id !== event_id) {
        return NextResponse.json({ error: "This coupon is not valid for this event." }, { status: 400 });
      }
      if (coupon.assigned_to_email && coupon.assigned_to_email.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({ error: "This coupon is not assigned to your account." }, { status: 400 });
      }
      // Check already used
      const { data: uses } = await db
        .from("coupon_uses")
        .select("id")
        .eq("coupon_id", coupon.id)
        .eq("used_by_email", email.toLowerCase())
        .limit(1);
      if (uses && uses.length > 0) {
        return NextResponse.json({ error: "You have already used this coupon." }, { status: 400 });
      }

      couponId     = coupon.id;
      discountType = coupon.discount_type;
      discountValue = coupon.discount_value;
      discount = calcDiscount(ev.price, discountType, discountValue);
    }

    const originalPrice = ev.price;
    const finalPrice    = Math.max(0, originalPrice - discount);

    // ── Free event: create confirmed registration immediately ──────────────────
    if (finalPrice === 0) {
      const code    = genCode();
      // Generate QR token before insert so it is saved atomically with the registration.
      // If this throws (bad env secret), the registration is never created — no orphaned records.
      const qrToken = signEventQR(code, event_id);

      const { data: reg, error: regErr } = await db
        .from("event_registrations")
        .upsert({
          registration_code: code,
          event_id,
          user_email:        email.toLowerCase().trim(),
          user_name:         name.trim(),
          phone:             phone || null,
          gender:            gender || null,
          date_of_birth:     date_of_birth || null,
          blood_group:       blood_group || null,
          emergency_contact: emergency_contact || null,
          special_notes:     special_notes || null,
          coupon_code:       coupon_code?.toUpperCase().trim() || null,
          coupon_id:         couponId,
          coupon_discount:   discount,
          original_price:    originalPrice,
          final_price:       finalPrice,
          payment_status:    "free",
          status:            "confirmed",
          distance_category: chosenCategory,
          qr_token:          qrToken,
        }, { onConflict: "event_id,user_email", ignoreDuplicates: false })
        .select("registration_code, qr_token")
        .single();

      if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

      const finalCode  = reg?.registration_code ?? code;
      const finalQr    = reg?.qr_token          ?? qrToken;

      // Redeem coupon atomically (fire-and-forget)
      if (couponId) {
        const { redeemCoupon } = await import("@/lib/coupon-redeem");
        redeemCoupon(couponId, email.toLowerCase()).catch(console.error);
      }

      // Send confirmation email with QR (fire-and-forget — email failure never blocks registration)
      ;(async () => {
        try {
          await sendEmail(
            email.toLowerCase().trim(),
            name.trim(),
            `Event Registration Confirmed – ${ev.title}`,
            eventRegistrationEmailHTML({
              name:             name.trim(),
              eventTitle:       ev.title,
              startDate:        ev.start_date,
              startTime:        ev.start_time ?? null,
              location:         ev.location,
              registrationCode: finalCode,
              distanceCategory: chosenCategory,
              qrToken:          finalQr,
            }),
            false, true, // isOtp=false, isTransactional=true — bypass NON_OTP_EMAILS_DISABLED
          );
        } catch (e) {
          console.error("[event-register] confirmation email failed (registration intact):", e);
        }
      })();

      return NextResponse.json({ success: true, free: true, registration_code: finalCode });
    }

    // ── Paid event: create pending_payment registration, caller creates Razorpay order ─
    // status = "pending_payment" so slot count (which only counts "confirmed") is not affected
    // until payment succeeds and verify-payment sets status = "confirmed"
    const code = existing?.registration_code ?? genCode();
    const { error: regErr2 } = await db
      .from("event_registrations")
      .upsert({
        registration_code: code,
        event_id,
        user_email:        email.toLowerCase().trim(),
        user_name:         name.trim(),
        phone:             phone || null,
        gender:            gender || null,
        date_of_birth:     date_of_birth || null,
        blood_group:       blood_group || null,
        emergency_contact: emergency_contact || null,
        special_notes:     special_notes || null,
        coupon_code:       coupon_code?.toUpperCase().trim() || null,
        coupon_id:         couponId,
        coupon_discount:   discount,
        original_price:    originalPrice,
        final_price:       finalPrice,
        payment_status:    "pending",
        status:            "pending_payment",
        distance_category: chosenCategory,
      }, { onConflict: "event_id,user_email", ignoreDuplicates: false });

    if (regErr2) return NextResponse.json({ error: regErr2.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      free: false,
      requires_payment: true,
      registration_code: code,
      original_price: originalPrice,
      coupon_discount: discount,
      final_price: finalPrice,
    });

  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
