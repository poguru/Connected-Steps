import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { generateRegistrationCode, signItRunQR } from "@/lib/it-run-auth";
import { sendItRunConfirmationEmail, sendItRunBibInviteEmail } from "@/lib/it-run-email";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { normalizePhone, isValidIndianPhone, phonesAreEqual } from "@/lib/phone-utils";

interface ParticipantInput {
  type: string; firstName: string; lastName: string; bibName: string;
  gender: string; dob: string; email: string; mobile: string;
  bloodGroup: string; emergencyName: string; emergencyPhone: string;
  companyName: string; employeeId: string; companyIdUrl: string;
  tshirtSize: string; medicalConditions: string; foodPreference: string;
}

// Server-authoritative size lists (mirrors event-config/route.ts — keep in sync)
const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const CHILD_SIZES = ["5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y"];

type ParticipantMeta = { is_child: boolean; tshirt_sizes: string[] };

function deriveParticipantMeta(
  categoryType: "solo" | "duo" | "kid",
  count: number,
): ParticipantMeta[] {
  if (categoryType === "kid") {
    return [
      { is_child: false, tshirt_sizes: ADULT_SIZES }, // index 0 = parent
      { is_child: true,  tshirt_sizes: CHILD_SIZES  }, // index 1 = child
    ];
  }
  return Array.from({ length: count }, () => ({
    is_child: false, tshirt_sizes: ADULT_SIZES,
  }));
}

const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE  = /^\d{10}$/;

// normalizePhone imported from @/lib/phone-utils

function validateParticipants(
  participants: ParticipantInput[],
  meta: ParticipantMeta[],
  eventDateMs: number,
): string | null {
  for (let i = 0; i < participants.length; i++) {
    const p   = participants[i];
    const m   = meta[i];
    const pfx = participants.length === 1 ? "Participant" : `Participant ${i + 1}`;

    if (!p.firstName?.trim())  return `${pfx}: first name is required`;
    if (!p.lastName?.trim())   return `${pfx}: last name is required`;
    if (!p.bibName?.trim())    return `${pfx}: BIB name is required`;

    // BIB name validation: max reasonable length (printer constraint)
    if (p.bibName.trim().length > 50) {
      return `${pfx}: BIB name cannot exceed 50 characters`;
    }

    // BIB name must not contain only whitespace or malicious content
    if (!/^[\w\s\-']+$/i.test(p.bibName.trim())) {
      return `${pfx}: BIB name contains invalid characters`;
    }

    if (!p.gender)             return `${pfx}: gender is required`;
    if (!p.bloodGroup)         return `${pfx}: blood group is required`;
    if (!p.tshirtSize)         return `${pfx}: t-shirt size is required`;
    if (!m.tshirt_sizes.includes(p.tshirtSize)) {
      return `${pfx}: invalid t-shirt size "${p.tshirtSize}"`;
    }
    if (!p.mobile?.trim()) {
      return `${pfx}: mobile number is required`;
    }
    if (!isValidIndianPhone(p.mobile.trim())) {
      return `${pfx}: valid 10-digit Indian mobile number is required`;
    }

    // DOB — required for everyone; must be a valid past date
    if (!p.dob) return `${pfx}: date of birth is required`;
    const dobMs = new Date(p.dob).getTime();
    if (isNaN(dobMs))       return `${pfx}: invalid date of birth`;
    if (dobMs >= Date.now()) return `${pfx}: date of birth must be in the past`;

    // Age validation based on participant type
    if (m.is_child) {
      // Child age rule: age is calculated on the event date, not today.
      // A child who turns 11 before the event day is ineligible even if they are 10 today.
      const ageOnEventDay = (eventDateMs - dobMs) / (365.25 * 86400000);
      if (ageOnEventDay >= 11) {
        return "Child participant must be 10 years or younger on the event date";
      }
    } else {
      // Adult rule: must be at least 18 years old on event date
      const ageOnEventDay = (eventDateMs - dobMs) / (365.25 * 86400000);
      if (ageOnEventDay < 18) {
        return `${pfx}: you must be at least 18 years old on the event date`;
      }
    }

    // Adult-only required fields
    if (!m.is_child) {
      if (!p.email?.trim() || !EMAIL_RE.test(p.email.trim())) {
        return `${pfx}: valid email address is required`;
      }
      if (!p.emergencyName?.trim()) {
        return `${pfx}: emergency contact name is required`;
      }
      if (!p.emergencyPhone?.trim() || !MOBILE_RE.test(p.emergencyPhone.trim())) {
        return `${pfx}: valid 10-digit emergency contact phone is required`;
      }

      // Emergency phone must be different from participant mobile
      if (phonesAreEqual(p.mobile.trim(), p.emergencyPhone.trim())) {
        return `${pfx}: emergency contact number must be different from your mobile number`;
      }

      if (!p.companyName?.trim()) {
        return `${pfx}: company name is required`;
      }
    }
  }
  return null; // all valid
}

// POST /api/it-run/register
// Creates a new registration + participant records.
// Payment is handled separately via /api/it-run/payment/create-order.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkAndRecordEndpointLimit(`itr:register:${ip}`, 5, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before trying again." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { categoryId, couponId, participants } = await req.json() as {
      categoryId:   string;
      couponId:     string | null;
      participants: ParticipantInput[];
    };

    if (!categoryId || !Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json({ error: "categoryId and participants are required" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Fetch category + event
    const { data: cat } = await db
      .from("it_run_categories")
      .select("id,event_id,name,category_type,price_rupees,max_participants,is_active")
      .eq("id", categoryId)
      .single<{
        id: string; event_id: string; name: string;
        category_type: "solo" | "duo" | "kid";
        price_rupees: number; max_participants: number | null; is_active: boolean;
      }>();

    if (!cat || !cat.is_active) {
      return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
    }

    // Check registration window; also fetch event_date for child age validation
    const { data: evStatus } = await db
      .from("it_run_events")
      .select("registration_closes_at,event_date")
      .eq("id", cat.event_id)
      .single<{ registration_closes_at: string | null; event_date: string }>();

    if (evStatus?.registration_closes_at && new Date(evStatus.registration_closes_at) < new Date()) {
      return NextResponse.json({ error: "Registration for this event is now closed" }, { status: 409 });
    }

    // Validate participant count against server-authoritative category type
    // SOLO, DUO, and KID categories all support N participants (multi-participant registration)
    const isMultiParticipantAllowed = ["solo", "duo", "kid"].includes(cat.category_type);
    const minParticipants = 1;
    const maxParticipants = isMultiParticipantAllowed ? 999 : 1; // Practical limit for 999

    if (participants.length < minParticipants || participants.length > maxParticipants) {
      const categoryName = cat.category_type === "solo" ? "SOLO" : cat.category_type === "duo" ? "DUO" : "KID";
      return NextResponse.json(
        { error: `${categoryName} category requires ${minParticipants}-${maxParticipants} participant(s), got ${participants.length}` },
        { status: 400 },
      );
    }

    // Derive per-participant metadata (child/adult, valid t-shirt sizes) server-side.
    // This ensures validation rules match what the event-config API advertises,
    // without trusting any client-supplied type or role field.
    const participantMeta = deriveParticipantMeta(cat.category_type, participants.length);

    // Use event date for child age calculation so the rule "10 years or younger on event day"
    // is enforced correctly regardless of when the registration happens.
    const eventDateMs = evStatus?.event_date ? new Date(evStatus.event_date).getTime() : Date.now();

    // Server-side participant field validation.
    // The client-side form is defence-in-depth only; the server is the authority.
    const validationError = validateParticipants(participants, participantMeta, eventDateMs);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const basePrice = cat.price_rupees;

    // Atomically validate and claim one coupon use.
    // The DB function acquires a FOR UPDATE lock on the coupon row so concurrent
    // uses serialize — the 101st use of a 100-use coupon is impossible.
    // Returns the discount amount in rupees, or NULL if the coupon is invalid,
    // inactive, expired, exhausted, or the order is below the minimum amount.
    let discountAmt    = 0;
    let couponReserved = false;

    if (couponId) {
      const { data: couponDiscount, error: couponErr } = await db.rpc("itr_use_coupon", {
        p_coupon_id:  couponId,
        p_event_id:   cat.event_id,
        p_base_price: basePrice,
      });

      if (couponErr) {
        console.error("[it-run/register] coupon RPC error:", couponErr.message);
        return NextResponse.json({ error: "Coupon validation failed" }, { status: 500 });
      }

      if (couponDiscount === null) {
        return NextResponse.json({ error: "Coupon is invalid or no longer available" }, { status: 409 });
      }

      discountAmt    = couponDiscount as number;
      couponReserved = true;
    }

    const finalPrice = Math.max(0, basePrice - discountAmt);
    const regCode    = generateRegistrationCode();

    // Atomically reserve capacity.
    // The DB function acquires a FOR UPDATE row lock on it_run_categories so
    // two simultaneous requests for the final slot serialize here — only one
    // can increment the counter past max_participants.
    // It also expires stale pending registrations (> 15 min without payment)
    // so abandoned attempts don't permanently consume capacity.
    const { data: reserveStatus, error: reserveErr } = await db.rpc(
      "itr_reserve_capacity",
      { p_category_id: categoryId, p_increment: participants.length, p_payment_ttl_mins: 15 },
    );

    if (reserveErr) {
      console.error("[it-run/register] capacity RPC error:", reserveErr.message);
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Capacity check failed" }, { status: 500 });
    }
    if (reserveStatus === "full") {
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "This category is fully booked" }, { status: 409 });
    }
    if (reserveStatus === "unavailable") {
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
    }

    // Insert registration
    // Resolve the CS account linked to this registration (if user completed email verification)
    const linkedUserEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "") ?? null;

    const { data: reg, error: regErr } = await db
      .from("it_run_registrations")
      .insert({
        event_id:          cat.event_id,
        category_id:       categoryId,
        registration_code: regCode,
        lead_email:        participants[0]?.email?.toLowerCase()?.trim() ?? "",
        participant_count: participants.length,
        base_price:        basePrice,
        discount_amount:   discountAmt,
        final_price:       finalPrice,
        coupon_id:         couponId ?? null,
        payment_status:    finalPrice === 0 ? "free" : "pending",
        linked_user_email: linkedUserEmail,
      })
      .select("id")
      .single();

    if (regErr || !reg) {
      console.error("[it-run/register] reg insert error:", regErr?.message);
      void db.rpc("itr_release_capacity", { p_category_id: categoryId, p_count: participants.length });
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Failed to create registration" }, { status: 500 });
    }

    // Insert participants
    const partInserts = participants.map((p, idx) => ({
      registration_id:    reg.id,
      event_id:           cat.event_id,
      participant_type:   p.type,
      first_name:         p.firstName.trim(),
      last_name:          p.lastName.trim(),
      bib_name:           p.bibName.trim().toUpperCase(),
      gender:             p.gender,
      dob:                p.dob || null,
      email:              p.email?.toLowerCase()?.trim() || null,
      mobile:             normalizePhone(p.mobile.trim()),
      blood_group:        p.bloodGroup || null,
      emergency_name:     p.emergencyName?.trim() || null,
      emergency_phone:    normalizePhone(p.emergencyPhone?.trim() || null),
      company_name:       p.companyName?.trim() || null,
      employee_id:        p.employeeId?.trim() || null,
      company_id_url:     p.companyIdUrl || null,
      tshirt_size:        p.tshirtSize || null,
      medical_conditions: p.medicalConditions?.trim() || null,
      food_preference:    p.foodPreference || null,
      // Child participants are exempt from company verification — mark as verified
      // so they never appear in the pending-verification admin queue.
      // Adults without an uploaded ID need manual follow-up → need_clarification.
      verification_status: participantMeta[idx]?.is_child
        ? "verified"
        : p.companyIdUrl
          ? "pending"
          : "need_clarification",
    }));

    const { data: parts, error: partErr } = await db
      .from("it_run_participants")
      .insert(partInserts)
      .select("id");

    if (partErr || !parts) {
      console.error("[it-run/register] participant insert error:", partErr?.message);
      await db.from("it_run_registrations").delete().eq("id", reg.id);
      void db.rpc("itr_release_capacity", { p_category_id: categoryId, p_count: participants.length });
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Failed to create participant records" }, { status: 500 });
    }

    // Generate a unique QR token per participant and persist it.
    // Each token encodes (registrationCode:participantId) so scanning at check-in
    // resolves the correct individual regardless of how many participants share
    // this registration.
    // IMPORTANT: we inspect each update result — a silently-failed QR write would
    // produce a broken QR code in the confirmation email.
    const participantQRs = parts.map(part => ({
      id:       part.id,
      qr_token: signItRunQR(regCode, part.id),
    }));

    const qrResults = await Promise.all(
      participantQRs.map(({ id, qr_token }) =>
        db.from("it_run_participants").update({ qr_token }).eq("id", id)
      )
    );

    const qrFailed = qrResults.filter(r => r.error);
    if (qrFailed.length > 0) {
      console.error(
        "[it-run/register] QR token update failed:",
        qrFailed.map(r => r.error?.message).join(", "),
      );
      // Roll back: delete the registration (cascade removes participants) and release reserved slot/coupon
      await db.from("it_run_registrations").delete().eq("id", reg.id);
      void db.rpc("itr_release_capacity", { p_category_id: categoryId, p_count: participants.length });
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json(
        { error: "Failed to generate QR codes, please try again" },
        { status: 500 },
      );
    }

    // Keep primary participant's token on the registration row for backward
    // compatibility with existing dashboard, webhook, and email code.
    await db
      .from("it_run_registrations")
      .update({ qr_token: participantQRs[0].qr_token })
      .eq("id", reg.id);

    // Record coupon use for audit trail.
    // use_count was already incremented atomically by itr_use_coupon above.
    if (couponId && discountAmt > 0) {
      const { error: useErr } = await db
        .from("it_run_coupon_uses")
        .insert({
          coupon_id:       couponId,
          registration_id: reg.id,
          used_by_email:   participants[0]?.email?.toLowerCase()?.trim() ?? "",
        });
      if (useErr) {
        console.error("[it-run/register] coupon_uses insert error:", useErr.message);
      }
    }

    // Free registrations (finalPrice === 0 via 100% coupon) never enter the
    // payment flow, so neither /payment/verify nor the Razorpay webhook will run.
    // Trigger the confirmation email here instead — same fire-and-forget pattern
    // used by the paid path in /payment/verify.
    // sendItRunConfirmationEmail is idempotent: its atomic
    //   UPDATE ... WHERE confirmation_email_sent_at IS NULL
    // guard means only the first call sends; retries are silently skipped.
    if (finalPrice === 0) {
      sendItRunConfirmationEmail(reg.id, regCode, "", "")
        .catch(e => console.error("[it-run/register] free-reg confirmation email error:", e));
      sendItRunBibInviteEmail(reg.id, participants[0]?.email?.toLowerCase()?.trim() ?? "")
        .catch(e => console.error("[it-run/register] free-reg bib invite email error:", e));
    }

    return NextResponse.json({
      registrationId:   reg.id,
      registrationCode: regCode,
      finalPrice,
      participantIds: parts.map(p => p.id),
    });
  } catch (e: unknown) {
    console.error("[it-run/register] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
