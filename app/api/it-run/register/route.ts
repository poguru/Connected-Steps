import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { teamKeysByIndex } from "@/lib/it-run-bib";
import { generateRegistrationCode, signItRunQR } from "@/lib/it-run-auth";
import { sendItRunPaymentReceivedEmail } from "@/lib/it-run-email";
import { runAfterResponse } from "@/lib/after-response";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { buildDashboardUrl } from "@/lib/it-run-dashboard-link";
import { hashDraftToken, isWellFormedDraftToken } from "@/lib/it-run-drafts";
import { bestEarlyBird, type EarlyBirdOffer } from "@/lib/it-run-early-bird";
import {
  participantCountAllowed, participantCountMessage, bookingPrice, isChildPosition, type CategoryType,
} from "@/lib/it-run-category-rules";
import { reserveSeats, releaseSeats, type SeatLine } from "@/lib/it-run-seats";
import { couponUncoveredCategories, claimRunners, releaseRunnerClaim } from "@/lib/it-run-registration-guards";
import { initialVerificationStatus, isStoredDocumentPath, idDocumentTypeFor, idUploadError } from "@/lib/it-run-id-verification";
import { registrationWindow, formatIst } from "@/lib/it-run-registration-window";
import { checkPersonName, checkBibName, normalizeName } from "@/lib/it-run-name-validation";
import { normalizeAltEmail, altEmailOrNull } from "@/lib/it-run-alt-email";
import {
  isValidEmail, parseCalendarDate, todayInIST, validateDateOfBirth, type CalendarDate,
  normalizeIndianPhone, emergencyMatchesMobile,
} from "@/lib/it-run-validation";

import {
  createItRunRegistration, validateParticipants, participantMetaByIndex, type ParticipantInput,
} from "@/lib/it-run-register-core";

// POST /api/it-run/register
// Creates one registration for the whole booking: one registration code, one payment, and one row per participant.
// Each participant names their own category, and the categories may differ within the booking (all of the same
// event). Payment is handled separately via /api/it-run/payment/create-order and charges the booking's total.
// The rules live in lib/it-run-register-core.ts, shared with the admin manual-registration route.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkAndRecordEndpointLimit(`itr:register:${ip}`, 30, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before trying again." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { categoryId, couponId, participants, draftToken } = await req.json() as {
      /** Used when a participant names no category of their own (a single-category booking) */
      categoryId?:  string | null;
      couponId:     string | null;
      participants: ParticipantInput[];
      draftToken?:  string | null;
    };

    // Signed-in participants keep their CS account on the registration
    const linkedUserEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "") ?? null;

    const outcome = await createItRunRegistration({
      categoryId,
      couponId: couponId ?? null,
      participants,
      draftToken,
      linkedUserEmail,
      source: "public",
    });
    return NextResponse.json(outcome.body, { status: outcome.ok ? 200 : outcome.status });
  } catch (e: unknown) {
    console.error("[it-run/register] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/it-run/register
// Edits the participant details of an EXISTING, unpaid registration (used when a participant goes back
// from review or payment to correct something). It never creates a registration or an order, never
// changes capacity or coupons, and never changes QR tokens, the registration code, or any participant's category.
//
// Refused: confirmed payments, category changes, expired reservations, and any participant ID that
// does not belong to this registration. Validation is identical to POST.
// Body: { registrationId, registrationCode, categoryId, participants: [{ id, categoryId?, ...fields }] }
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
  // Details can be corrected until payment, and while the IDs are being verified. A cancelled registration cannot.
  if (reg.registration_status !== "active" && reg.registration_status !== "pending_verification") {
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

  // Every participant must be one of this registration's participants, each exactly once
  const { data: existing, error: existingErr } = await db
    .from("it_run_participants")
    .select("id, company_id_url, verification_status, category_id")
    .eq("registration_id", reg.id);
  if (existingErr) {
    return NextResponse.json({ error: "We couldn't save your changes. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
  }
  const byId = new Map((existing ?? []).map(r => [r.id as string, r as { id: string; company_id_url: string | null; verification_status: string; category_id: string | null }]));
  const seen = new Set<string>();
  for (const p of participants) {
    if (!p.id || !byId.has(p.id) || seen.has(p.id)) {
      return NextResponse.json({ error: "These participant details don't match this registration. Reload and try again.", code: "PARTICIPANT_MISMATCH" }, { status: 400 });
    }
    seen.add(p.id);
  }

  // A participant's category is set at registration and never changes here
  const storedCategoryIds = participants.map(p => byId.get(p.id as string)!.category_id ?? reg.category_id);
  for (let i = 0; i < participants.length; i++) {
    const requested = participants[i].categoryId;
    if (requested && requested !== storedCategoryIds[i]) {
      return NextResponse.json({
        error: "A participant's category can't be changed after registration has started. Email info@connectedsteps.in for help.",
        code: "CATEGORY_LOCKED",
      }, { status: 409 });
    }
  }

  const uniqueCategoryIds = Array.from(new Set(storedCategoryIds));
  const { data: cats } = await db
    .from("it_run_categories")
    .select("id, category_type")
    .in("id", uniqueCategoryIds)
    .returns<Array<{ id: string; category_type: CategoryType }>>();
  const { data: ev } = await db
    .from("it_run_events")
    .select("event_date")
    .eq("id", reg.event_id)
    .maybeSingle<{ event_date: string }>();
  const eventDate = parseCalendarDate(ev?.event_date);
  if (!cats || cats.length !== uniqueCategoryIds.length || !eventDate) {
    return NextResponse.json({ error: "Registration is temporarily unavailable. Please try again later.", code: "SERVER_ERROR" }, { status: 503 });
  }

  // Same rules as registration. The server is the authority.
  const typeById = new Map(cats.map(c => [c.id, c.category_type]));
  const meta = participantMetaByIndex(storedCategoryIds, typeById);
  const fieldError = validateParticipants(participants, meta, eventDate, todayInIST());
  if (fieldError) {
    return NextResponse.json({ error: fieldError.message, field: fieldError.field, participant_index: fieldError.participantIndex }, { status: 400 });
  }

  const results = await Promise.all(participants.map((p, idx) => {
    const current = byId.get(p.id as string)!;
    const isChild = meta[idx]?.is_child ?? false;
    const companyChanged = !!p.companyIdUrl && p.companyIdUrl !== current.company_id_url;
    return db
      .from("it_run_participants")
      .update({
        participant_type:   p.type,
        first_name:         normalizeName(p.firstName),
        last_name:          normalizeName(p.lastName),
        bib_name:           normalizeName(p.bibName).toUpperCase(),
        gender:             p.gender,
        dob:                p.dob || null,
        email:              p.email?.toLowerCase()?.trim() || null,
        alt_email:          altEmailOrNull(p.altEmail),
        mobile:             normalizeIndianPhone(p.mobile) ?? p.mobile.trim(),
        blood_group:        p.bloodGroup || null,
        emergency_name:     p.emergencyName ? normalizeName(p.emergencyName) || null : null,
        emergency_phone:    p.emergencyPhone?.trim() || null,
        company_name:       p.companyName?.trim() || null,
        employee_id:        p.employeeId?.trim() || null,
        tshirt_size:        p.tshirtSize || null,
        medical_conditions: p.medicalConditions?.trim() || null,
        food_preference:    p.foodPreference || null,
        // A new company ID document goes back into review. Children stay exempt.
        // No document on file and none given: the participant continues without an ID (not_provided).
        ...(companyChanged ? {
          company_id_url: p.companyIdUrl,
          id_document_type: idDocumentTypeFor(p.companyIdUrl, p.idDocumentType),
          verification_status: initialVerificationStatus(isChild, p.companyIdUrl),
        } : (!p.companyIdUrl && !current.company_id_url && !isChild) ? {
          verification_status: "not_provided",
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
