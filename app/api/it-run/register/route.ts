import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { generateRegistrationCode, signItRunQR } from "@/lib/it-run-auth";
import { sendItRunConfirmationEmail, sendItRunBibInviteEmail } from "@/lib/it-run-email";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { buildDashboardUrl } from "@/lib/it-run-dashboard-link";
import { hashDraftToken, isWellFormedDraftToken } from "@/lib/it-run-drafts";
import { requiredParticipantCount, categoryTypeLabel } from "@/lib/it-run-category-rules";
import {
  isValidEmail, parseCalendarDate, todayInIST, validateDateOfBirth, type CalendarDate,
} from "@/lib/it-run-validation";

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

const MOBILE_RE  = /^\d{10}$/;

// Normalize Indian phone numbers to 10-digit format
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.endsWith("91") && digits.length === 12) {
    return digits.slice(2); // +91 prefix
  }
  if (digits.length === 10) {
    return digits; // Already 10 digits
  }
  return digits.slice(-10); // Take last 10 digits
}

export interface ParticipantFieldError {
  message: string;
  field: "firstName" | "lastName" | "bibName" | "gender" | "bloodGroup" | "tshirtSize" | "mobile" | "dob" | "email" | "emergencyName" | "emergencyPhone" | "companyName";
  participantIndex: number;
}

function validateParticipants(
  participants: ParticipantInput[],
  meta: ParticipantMeta[],
  eventDate: CalendarDate,
  today: CalendarDate,
): ParticipantFieldError | null {
  for (let i = 0; i < participants.length; i++) {
    const p   = participants[i];
    const m   = meta[i];
    const pfx = participants.length === 1 ? "Participant" : `Participant ${i + 1}`;
    const err = (field: ParticipantFieldError["field"], message: string): ParticipantFieldError =>
      ({ message: `${pfx}: ${message}`, field, participantIndex: i });

    if (!p.firstName?.trim())  return err("firstName", "first name is required");
    if (!p.lastName?.trim())   return err("lastName", "last name is required");
    if (!p.bibName?.trim())    return err("bibName", "BIB name is required");

    // BIB name validation: max reasonable length (printer constraint)
    if (p.bibName.trim().length > 50) {
      return err("bibName", "BIB name cannot exceed 50 characters");
    }

    // BIB name must not contain only whitespace or malicious content
    if (!/^[\w\s\-']+$/i.test(p.bibName.trim())) {
      return err("bibName", "BIB name contains invalid characters");
    }

    if (!p.gender)             return err("gender", "gender is required");
    if (!p.bloodGroup)         return err("bloodGroup", "blood group is required");
    if (!p.tshirtSize)         return err("tshirtSize", "t-shirt size is required");
    if (!m.tshirt_sizes.includes(p.tshirtSize)) {
      return err("tshirtSize", `invalid t-shirt size "${p.tshirtSize}"`);
    }
    if (!p.mobile?.trim() || !MOBILE_RE.test(p.mobile.trim())) {
      return err("mobile", "valid 10-digit mobile number is required");
    }

    // Date of birth: strict calendar parse (no rollover), not in the future, and age-eligible
    // on the event date. Adults must be 18+; the kid-category child must be 5 to 10.
    const dobResult = validateDateOfBirth(p.dob, { isChild: m.is_child, eventDate, today });
    if (!dobResult.ok) return err("dob", dobResult.message);

    // Email: required for adults; when a child provides one, it must still be valid.
    if (!m.is_child) {
      if (!p.email?.trim()) return err("email", "email address is required");
    }
    if (p.email?.trim() && !isValidEmail(p.email)) {
      return err("email", "please enter a valid email address");
    }

    // Adult-only required fields
    if (!m.is_child) {
      if (!p.emergencyName?.trim()) {
        return err("emergencyName", "emergency contact name is required");
      }
      if (!p.emergencyPhone?.trim() || !MOBILE_RE.test(p.emergencyPhone.trim())) {
        return err("emergencyPhone", "valid 10-digit emergency contact phone is required");
      }

      // Emergency phone must be different from participant mobile
      const normalizedMobile = normalizePhone(p.mobile.trim());
      const normalizedEmergency = normalizePhone(p.emergencyPhone.trim());
      if (normalizedMobile === normalizedEmergency) {
        return err("emergencyPhone", "emergency contact number must be different from your mobile number");
      }

      if (!p.companyName?.trim()) {
        return err("companyName", "company name is required");
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

    const { categoryId, couponId, participants, draftToken } = await req.json() as {
      categoryId:   string;
      couponId:     string | null;
      participants: ParticipantInput[];
      draftToken?:  string | null;
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

    // The exact participant count comes from the category type (same rule the form uses).
    const requiredCount = requiredParticipantCount(cat.category_type);
    if (participants.length !== requiredCount) {
      return NextResponse.json(
        { error: `${categoryTypeLabel(cat.category_type)} needs exactly ${requiredCount} participant${requiredCount === 1 ? "" : "s"}. You entered ${participants.length}.`, code: "PARTICIPANT_COUNT" },
        { status: 400 },
      );
    }

    // Derive per-participant metadata (child/adult, valid t-shirt sizes) server-side.
    // This ensures validation rules match what the event-config API advertises,
    // without trusting any client-supplied type or role field.
    const participantMeta = deriveParticipantMeta(cat.category_type, participants.length);

    // Age reference date = the event's calendar date (YYYY-MM-DD from the database), so ages are
    // calendar-based and independent of the server's timezone. Missing event date is a server error.
    const eventDate = parseCalendarDate(evStatus?.event_date);
    if (!eventDate) {
      console.error("[it-run/register] event has no valid event_date; cannot evaluate age eligibility");
      return NextResponse.json({ error: "Registration is temporarily unavailable. Please try again later." }, { status: 503 });
    }

    // Server-side participant field validation (authoritative).
    // The client-side form is defence-in-depth only.
    const validationError = validateParticipants(participants, participantMeta, eventDate, todayInIST());
    if (validationError) {
      return NextResponse.json(
        { error: validationError.message, field: validationError.field, participant_index: validationError.participantIndex },
        { status: 400 },
      );
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
      mobile:             p.mobile.trim(),
      blood_group:        p.bloodGroup || null,
      emergency_name:     p.emergencyName?.trim() || null,
      emergency_phone:    p.emergencyPhone?.trim() || null,
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

    // Mark the draft this registration came from as converted, so it can't be saved over afterwards.
    // Best effort: the registration already exists; an unmarked draft only costs a stale resume prompt.
    if (isWellFormedDraftToken(draftToken)) {
      await db
        .from("it_run_drafts")
        .update({ status: "converted", registration_id: reg.id })
        .eq("token_hash", hashDraftToken(draftToken))
        .eq("status", "open")
        // Only close the draft for the category this registration was made for
        .eq("state->>selectedCatId", categoryId)
        .then(() => {}, e => console.error("[it-run/register] draft conversion failed:", (e as Error).name));
    }

    return NextResponse.json({
      registrationId:   reg.id,
      registrationCode: regCode,
      dashboardUrl:     buildDashboardUrl(regCode),
      finalPrice,
      participantIds: parts.map(p => p.id),
    });
  } catch (e: unknown) {
    console.error("[it-run/register] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/it-run/register
// Edits the participant details of an EXISTING, unpaid registration (used when a participant goes back
// from review or payment to correct something). It never creates a registration or an order, never
// changes capacity or coupons, and never changes QR tokens or the registration code.
//
// Refused: confirmed payments, category changes, expired reservations, and any participant ID that
// does not belong to this registration. Validation is identical to POST.
// Body: { registrationId, registrationCode, categoryId, participants: [{ id, ...fields }] }
export async function PATCH(req: NextRequest) {
  const rl = await checkAndRecordEndpointLimit(`itr:edit:${getClientIp(req)}`, 20, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many changes. Please wait a moment.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: {
    registrationId?: string; registrationCode?: string; categoryId?: string;
    participants?: Array<ParticipantInput & { id?: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request.", code: "INVALID_REQUEST" }, { status: 400 });
  }
  const { registrationId, registrationCode, categoryId, participants } = body;
  if (!registrationId || !registrationCode || !categoryId || !Array.isArray(participants) || participants.length === 0) {
    return NextResponse.json({ error: "Registration details are missing.", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const db = getSupabaseServer();
  // Both the ID and the code must match: the code is the second secret the browser holds
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, event_id, registration_code, category_id, payment_status, registration_status, participant_count")
    .eq("id", registrationId)
    .maybeSingle<{
      id: string; event_id: string; registration_code: string; category_id: string;
      payment_status: string; registration_status: string; participant_count: number;
    }>();
  if (!reg || reg.registration_code !== registrationCode) {
    return NextResponse.json({ error: "We couldn't find this registration.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (reg.registration_status !== "active") {
    return NextResponse.json({ error: "This registration is no longer active.", code: "REGISTRATION_CLOSED" }, { status: 409 });
  }
  if (reg.payment_status === "paid" || reg.payment_status === "partially_refunded" || reg.payment_status === "refunded") {
    return NextResponse.json({
      error: "Your payment is already confirmed, so your details can't be changed here. To change them, email info@connectedsteps.in.",
      code: "PAYMENT_CONFIRMED",
    }, { status: 409 });
  }
  if (reg.payment_status === "expired") {
    return NextResponse.json({
      error: "Your reservation has expired. Please start a new registration.",
      code: "RESERVATION_EXPIRED",
    }, { status: 409 });
  }
  if (reg.category_id !== categoryId) {
    return NextResponse.json({
      error: "Your category can't be changed after registration has started. Email info@connectedsteps.in for help.",
      code: "CATEGORY_LOCKED",
    }, { status: 409 });
  }
  if (participants.length !== reg.participant_count) {
    return NextResponse.json({ error: "The number of participants doesn't match this registration.", code: "PARTICIPANT_COUNT" }, { status: 400 });
  }

  const { data: cat } = await db
    .from("it_run_categories")
    .select("id, category_type")
    .eq("id", reg.category_id)
    .maybeSingle<{ id: string; category_type: "solo" | "duo" | "kid" }>();
  const { data: ev } = await db
    .from("it_run_events")
    .select("event_date")
    .eq("id", reg.event_id)
    .maybeSingle<{ event_date: string }>();
  const eventDate = parseCalendarDate(ev?.event_date);
  if (!cat || !eventDate) {
    return NextResponse.json({ error: "Registration is temporarily unavailable. Please try again later.", code: "SERVER_ERROR" }, { status: 503 });
  }

  // Same rules as registration. The server is the authority.
  const meta = deriveParticipantMeta(cat.category_type, participants.length);
  const fieldError = validateParticipants(participants, meta, eventDate, todayInIST());
  if (fieldError) {
    return NextResponse.json({ error: fieldError.message, field: fieldError.field, participant_index: fieldError.participantIndex }, { status: 400 });
  }

  // Every participant must be one of this registration's participants, each exactly once
  const { data: existing, error: existingErr } = await db
    .from("it_run_participants")
    .select("id, company_id_url, verification_status")
    .eq("registration_id", reg.id);
  if (existingErr) {
    return NextResponse.json({ error: "We couldn't save your changes. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
  }
  const byId = new Map((existing ?? []).map(r => [r.id as string, r as { id: string; company_id_url: string | null; verification_status: string }]));
  const seen = new Set<string>();
  for (const p of participants) {
    if (!p.id || !byId.has(p.id) || seen.has(p.id)) {
      return NextResponse.json({ error: "These participant details don't match this registration. Reload and try again.", code: "PARTICIPANT_MISMATCH" }, { status: 400 });
    }
    seen.add(p.id);
  }

  const results = await Promise.all(participants.map((p, idx) => {
    const current = byId.get(p.id as string)!;
    const isChild = meta[idx]?.is_child ?? false;
    const companyChanged = !!p.companyIdUrl && p.companyIdUrl !== current.company_id_url;
    return db
      .from("it_run_participants")
      .update({
        participant_type:   p.type,
        first_name:         p.firstName.trim(),
        last_name:          p.lastName.trim(),
        bib_name:           p.bibName.trim().toUpperCase(),
        gender:             p.gender,
        dob:                p.dob || null,
        email:              p.email?.toLowerCase()?.trim() || null,
        mobile:             p.mobile.trim(),
        blood_group:        p.bloodGroup || null,
        emergency_name:     p.emergencyName?.trim() || null,
        emergency_phone:    p.emergencyPhone?.trim() || null,
        company_name:       p.companyName?.trim() || null,
        employee_id:        p.employeeId?.trim() || null,
        tshirt_size:        p.tshirtSize || null,
        medical_conditions: p.medicalConditions?.trim() || null,
        food_preference:    p.foodPreference || null,
        // A new company ID document goes back into review. Children stay exempt.
        ...(companyChanged ? {
          company_id_url: p.companyIdUrl,
          verification_status: isChild ? "verified" : "pending",
        } : {}),
      })
      .eq("id", p.id as string)
      .eq("registration_id", reg.id);
  }));

  const failed = results.filter(r => r.error);
  if (failed.length > 0) {
    console.error("[it-run/register] edit failed for", failed.length, "participant(s)");
    return NextResponse.json({ error: "We couldn't save all of your changes. Please try again.", code: "SAVE_FAILED" }, { status: 500 });
  }

  // Keep the lead email in step with the first participant (it is used for confirmations)
  const leadEmail = participants[0].email?.toLowerCase()?.trim();
  if (leadEmail) {
    await db.from("it_run_registrations").update({ lead_email: leadEmail }).eq("id", reg.id);
  }

  await db.from("it_run_audit_logs").insert({
    actor_email: leadEmail || "participant",
    actor_role: "participant",
    action: "registration_edited",
    entity_type: "registration",
    entity_id: reg.id,
    ip: getClientIp(req),
    detail: { registration_code: reg.registration_code, participants: participants.length },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, registrationCode: reg.registration_code });
}
