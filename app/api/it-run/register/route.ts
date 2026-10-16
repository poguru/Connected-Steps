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
import { checkPersonName, checkBibName, normalizeName } from "@/lib/it-run-name-validation";
import { normalizeAltEmail, altEmailOrNull } from "@/lib/it-run-alt-email";
import {
  isValidEmail, parseCalendarDate, todayInIST, validateDateOfBirth, type CalendarDate,
  normalizeIndianPhone, emergencyMatchesMobile,
} from "@/lib/it-run-validation";

interface ParticipantInput {
  type: string; firstName: string; lastName: string; bibName: string;
  gender: string; dob: string; email: string; mobile: string; altEmail?: string | null;
  bloodGroup: string; emergencyName: string; emergencyPhone: string;
  companyName: string; employeeId: string; companyIdUrl: string;
  /** "company" (default) or "government": the kind of ID in companyIdUrl */
  idDocumentType?: string;
  tshirtSize: string; medicalConditions: string; foodPreference: string;
  /** The category this participant is registered in. Each participant chooses their own. */
  categoryId?: string;
}

interface CategoryRow {
  id: string; event_id: string; name: string;
  category_type: CategoryType;
  price_rupees: number; max_participants: number | null; is_active: boolean;
}

// Server-authoritative size lists (mirrors event-config/route.ts — keep in sync)
const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const CHILD_SIZES = ["5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y"];

type ParticipantMeta = { is_child: boolean; tshirt_sizes: string[] };

/** Metadata for the participant at this position within their own category. */
function participantMetaFor(categoryType: CategoryType, indexInCategory: number): ParticipantMeta {
  const child = isChildPosition(categoryType, indexInCategory);
  return { is_child: child, tshirt_sizes: child ? CHILD_SIZES : ADULT_SIZES };
}

/**
 * Metadata for every participant in booking order. Each category's participants are numbered within that
 * category, so a parent and child pair is read correctly even when several categories share the booking.
 */
function participantMetaByIndex(categoryIds: string[], typeById: Map<string, CategoryType>): ParticipantMeta[] {
  const positionInCategory = new Map<string, number>();
  return categoryIds.map(id => {
    const position = positionInCategory.get(id) ?? 0;
    positionInCategory.set(id, position + 1);
    return participantMetaFor(typeById.get(id) ?? "solo", position);
  });
}

/** Participant indexes grouped by category, in the order they were entered. */
function indexesByCategory(categoryIds: string[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  categoryIds.forEach((id, index) => {
    const list = groups.get(id);
    if (list) list.push(index);
    else groups.set(id, [index]);
  });
  return groups;
}

export interface ParticipantFieldError {
  message: string;
  field: "firstName" | "lastName" | "bibName" | "gender" | "bloodGroup" | "tshirtSize" | "mobile" | "dob" | "email" | "altEmail" | "emergencyName" | "emergencyPhone" | "companyName" | "companyIdUrl";
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
    // Names: one shared policy (letters in any script, spaces, hyphen, apostrophe). Invalid names never persist.
    const first = checkPersonName(p.firstName, "first name");
    if (!first.ok) return err("firstName", first.message);
    const last = checkPersonName(p.lastName, "last name");
    if (!last.ok) return err("lastName", last.message);
    const bib = checkBibName(p.bibName);
    if (!bib.ok) return err("bibName", bib.message);


    if (!p.gender)             return err("gender", "gender is required");
    if (!p.bloodGroup)         return err("bloodGroup", "blood group is required");
    if (!p.tshirtSize)         return err("tshirtSize", "t-shirt size is required");
    if (!m.tshirt_sizes.includes(p.tshirtSize)) {
      return err("tshirtSize", `invalid t-shirt size "${p.tshirtSize}"`);
    }
    // Mobile and emergency contact use the shared rule: 10 digits, with or without +91
    if (!normalizeIndianPhone(p.mobile)) {
      return err("mobile", "valid 10-digit mobile number is required");
    }

    // A document reference must be one our upload produced; anything else is refused, never stored
    if (p.companyIdUrl && !isStoredDocumentPath(p.companyIdUrl)) {
      return err("companyIdUrl", "the ID document could not be verified. Please upload it again or choose Continue Without ID");
    }

    // Every adult uploads a company or government-issued ID to register. Children are exempt.
    const uploadMessage = idUploadError(p.companyIdUrl, m.is_child);
    if (uploadMessage) return err("companyIdUrl", uploadMessage);

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
    // The optional alternative address is checked here too, never trusted from the browser
    const alt = normalizeAltEmail(p.altEmail);
    if (!alt.ok) return err("altEmail", alt.message);

    // Adult-only required fields
    if (!m.is_child) {
      const emergency = checkPersonName(p.emergencyName, "emergency contact name");
      if (!emergency.ok) return err("emergencyName", emergency.message);
      if (!normalizeIndianPhone(p.emergencyPhone)) {
        return err("emergencyPhone", "valid 10-digit emergency contact phone is required");
      }
      // Compared after normalization, so +91 and bare forms of the same number match
      if (emergencyMatchesMobile(p.mobile, p.emergencyPhone)) {
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
// Creates one registration for the whole booking: one registration code, one payment, and one row per participant.
// Each participant names their own category, and the categories may differ within the booking (all of the same
// event). Payment is handled separately via /api/it-run/payment/create-order and charges the booking's total.
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

    const { categoryId: bodyCategoryId, couponId, participants, draftToken } = await req.json() as {
      /** Used when a participant names no category of their own (a single-category booking) */
      categoryId?:  string | null;
      couponId:     string | null;
      participants: ParticipantInput[];
      draftToken?:  string | null;
    };

    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json({ error: "categoryId and participants are required" }, { status: 400 });
    }
    const participantCategoryIds = participants.map(p => p.categoryId || bodyCategoryId || "");
    if (participantCategoryIds.some(id => !id)) {
      return NextResponse.json({ error: "categoryId and participants are required" }, { status: 400 });
    }

    const db = getSupabaseServer();
    const uniqueCategoryIds = Array.from(new Set(participantCategoryIds));

    // Fetch every category the booking uses
    const { data: catRows, error: catErr } = await db
      .from("it_run_categories")
      .select("id,event_id,name,category_type,price_rupees,max_participants,is_active")
      .in("id", uniqueCategoryIds)
      .returns<CategoryRow[]>();
    if (catErr || !catRows || catRows.length !== uniqueCategoryIds.length || catRows.some(c => !c.is_active)) {
      return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
    }
    const categoryById = new Map(catRows.map(c => [c.id, c]));
    const primary = categoryById.get(participantCategoryIds[0])!;
    if (catRows.some(c => c.event_id !== primary.event_id)) {
      return NextResponse.json({ error: "All categories in one registration must belong to the same event." }, { status: 400 });
    }
    const typeById = new Map(catRows.map(c => [c.id, c.category_type]));

    // Check registration window; also fetch event_date for child age validation
    const { data: evStatus } = await db
      .from("it_run_events")
      .select("registration_closes_at,event_date")
      .eq("id", primary.event_id)
      .single<{ registration_closes_at: string | null; event_date: string }>();

    if (evStatus?.registration_closes_at && new Date(evStatus.registration_closes_at) < new Date()) {
      return NextResponse.json({ error: "Registration for this event is now closed" }, { status: 409 });
    }

    // Each category must be a valid number of people: individual runners, or whole pairs for duo and kid.
    const groups = indexesByCategory(participantCategoryIds);
    for (const [id, indexes] of groups) {
      const cat = categoryById.get(id)!;
      if (!participantCountAllowed(cat.category_type, indexes.length)) {
        return NextResponse.json(
          { error: participantCountMessage(cat.category_type, indexes.length), code: "PARTICIPANT_COUNT" },
          { status: 400 },
        );
      }
    }

    // Derive per-participant metadata (child/adult, valid t-shirt sizes) server-side.
    // This ensures validation rules match what the event-config API advertises,
    // without trusting any client-supplied type or role field.
    const participantMeta = participantMetaByIndex(participantCategoryIds, typeById);
    // The two members of each duo or parent-and-child team share a key, so their BIB numbers pair exactly
    const participantTeamKeys = teamKeysByIndex(participantCategoryIds, typeById, randomUUID);

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

    // The same runners cannot be registered twice while the first booking waits for payment. The claim is one atomic
  // statement in the database, taken before any seat or discount is held. It is given back if this registration
  // does not go ahead (see releaseHolds below).
  const leadEmail = participants[0]?.email?.toLowerCase()?.trim() ?? "";
  const runnerMobiles = participants.map(p => normalizeIndianPhone(p.mobile) ?? p.mobile.trim());
  let claimedRunners = false;
  if (leadEmail) {
    const claim = await claimRunners(db, primary.event_id, leadEmail, runnerMobiles);
    if (claim.result === "error") {
      return NextResponse.json({ error: "We couldn't check your registration right now. Please try again." }, { status: 500 });
    }
    if (claim.result === "duplicate") {
      return NextResponse.json({
        error: "These runners already have a registration waiting for payment. Finish that payment, or wait 15 minutes before registering them again.",
        code: "DUPLICATE_REGISTRATION",
      }, { status: 409 });
    }
    claimedRunners = claim.claimed;
  }

  // One line per category: its seats and its price. A fixed-composition team pays once; each individual runner pays.
    const lines = Array.from(groups, ([id, indexes]) => {
      const cat = categoryById.get(id)!;
      return {
        categoryId: id,
        count:      indexes.length,
        price:      bookingPrice(cat.category_type, cat.price_rupees, indexes.length),
      };
    });
    const basePrice = lines.reduce((sum, line) => sum + line.price, 0);
    const seatLines: SeatLine[] = lines.map(line => ({ categoryId: line.categoryId, count: line.count }));

    // Discounts. Only one of an early bird or a coupon applies to a booking. An early bird is per category: each
    // category with an offer gets its own, on its own line. Both are claimed here, on the server.
    let couponReserved = false;
    const claimedOffers: string[] = [];
    // Releases every hold this request took: its coupon use and any early bird places it claimed.
    const releaseHolds = async () => {
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      if (claimedRunners) void releaseRunnerClaim(db, primary.event_id, leadEmail, runnerMobiles);
      for (const offerId of claimedOffers) void db.rpc("itr_early_bird_release", { p_offer_id: offerId });
    };

    const nowIso = new Date().toISOString();
    const { data: ebOffers, error: ebErr } = await db
      .from("it_run_early_bird_offers")
      .select("id, category_id, name, discount_type, discount_value, starts_at, ends_at, status, redemption_limit, redemptions_used, min_payable_rupees")
      .in("category_id", uniqueCategoryIds)
      .eq("status", "active")
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso);
    if (ebErr) {
      console.error("[it-run/register] early bird lookup failed:", ebErr.message);
      await releaseHolds();
      return NextResponse.json({ error: "We couldn't check offers right now. Please try again." }, { status: 500 });
    }

    const offers = (ebOffers ?? []) as EarlyBirdOffer[];
    const applied: Array<{ offerId: string; discount: number }> = [];
    for (const line of lines) {
      const best = bestEarlyBird(line.price, offers.filter(o => o.category_id === line.categoryId), Date.now());
      if (best) applied.push({ offerId: best.offer.id, discount: best.discount });
    }
    if (applied.length > 0 && couponId) {
      return NextResponse.json({
        error: "An early bird offer applies to a category in this registration, and it can't be combined with a discount code. Remove the code to continue.",
        code: "EARLY_BIRD_NO_COUPON",
      }, { status: 409 });
    }
    let earlyBirdDiscount = 0;
    for (const claim of applied) {
      const { data: claimed, error: claimErr } = await db.rpc("itr_early_bird_claim", { p_offer_id: claim.offerId });
      if (claimErr || !claimed) {
        await releaseHolds();
        if (claimErr) {
          console.error("[it-run/register] early bird claim failed:", claimErr.message);
          return NextResponse.json({ error: "We couldn't apply the offer right now. Please try again." }, { status: 500 });
        }
        return NextResponse.json({
          error: "An early bird offer in this registration has just sold out or ended. Refresh the page to see the current price.",
          code: "EARLY_BIRD_UNAVAILABLE",
        }, { status: 409 });
      }
      claimedOffers.push(claim.offerId);
      earlyBirdDiscount += claim.discount;
    }
    // The registration stores one offer for display; each claimed offer is still recorded on its own.
    const earlyBirdOfferId = applied[0]?.offerId ?? null;

    // Atomically validate and claim one coupon use.
    // The DB function acquires a FOR UPDATE lock on the coupon row so concurrent
    // uses serialize — the 101st use of a 100-use coupon is impossible.
    // Returns the discount amount in rupees, or NULL if the coupon is invalid,
    // inactive, expired, exhausted, or the order is below the minimum amount.
    let discountAmt = earlyBirdDiscount;
    if (couponId && claimedOffers.length === 0) {
      // A code limited to some categories must cover every category in the booking. Checked here, on the server,
      // because the validate step is only advice that the browser follows.
      const { data: couponRow, error: couponRowErr } = await db
        .from("it_run_coupons")
        .select("applicable_category_ids")
        .eq("id", couponId)
        .maybeSingle<{ applicable_category_ids: string[] | null }>();
      if (couponRowErr) {
        console.error("[it-run/register] coupon lookup failed:", couponRowErr.code ?? "unknown");
        await releaseHolds();
        return NextResponse.json({ error: "Coupon validation failed" }, { status: 500 });
      }
      const uncovered = couponUncoveredCategories(couponRow?.applicable_category_ids ?? null, uniqueCategoryIds);
      if (uncovered.length > 0) {
        await releaseHolds();
        const names = uncovered.map(id => categoryById.get(id)?.name ?? "a category in this booking").join(", ");
        return NextResponse.json({
          error: "This discount code doesn't apply to " + names + ". Remove the code, or that category, to continue.",
          code: "COUPON_CATEGORY",
        }, { status: 409 });
      }

      const { data: couponDiscount, error: couponErr } = await db.rpc("itr_use_coupon", {
        p_coupon_id:  couponId,
        p_event_id:   primary.event_id,
        p_base_price: basePrice,
      });

      if (couponErr) {
        console.error("[it-run/register] coupon RPC error:", couponErr.message);
        await releaseHolds();
        return NextResponse.json({ error: "Coupon validation failed" }, { status: 500 });
      }

      if (couponDiscount === null) {
        await releaseHolds();
        return NextResponse.json({ error: "Coupon is invalid or no longer available" }, { status: 409 });
      }

      discountAmt    = couponDiscount as number;
      couponReserved = true;
    }

    const finalPrice = Math.max(0, basePrice - discountAmt);
    const regCode    = generateRegistrationCode();

    // Atomically reserve the seats of every category, or none. The DB function locks the event's categories
    // in id order, so two simultaneous bookings for the final seats serialize here.
    // It also expires stale pending registrations (> 15 min without payment) so abandoned attempts don't
    // permanently consume capacity.
    const reserved = await reserveSeats(db, seatLines, 15);
    if (reserved !== "confirmed") {
      await releaseHolds();
      if (reserved === "full") {
        return NextResponse.json({
          error: "A category in this registration is fully booked. Remove it, or choose another category.",
          code: "CATEGORY_FULL",
        }, { status: 409 });
      }
      if (reserved === "unavailable") {
        return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
      }
      return NextResponse.json({ error: "Capacity check failed" }, { status: 500 });
    }

    // Insert registration
    // Resolve the CS account linked to this registration (if user completed email verification)
    const linkedUserEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "") ?? null;

    const { data: reg, error: regErr } = await db
      .from("it_run_registrations")
      .insert({
        event_id:          primary.event_id,
        // The booking's first category. Each participant's own category is on their participant row.
        category_id:       primary.id,
        registration_code: regCode,
        lead_email:        participants[0]?.email?.toLowerCase()?.trim() ?? "",
        participant_count: participants.length,
        base_price:        basePrice,
        discount_amount:   discountAmt,
        final_price:       finalPrice,
        early_bird_offer_id: earlyBirdOfferId,
        coupon_id:         couponId ?? null,
        payment_status:    finalPrice === 0 ? "free" : "pending",
        // Confirmed only after payment AND an admin has verified every adult's ID (see lib/it-run-confirmation.ts)
        registration_status: "pending_verification",
        linked_user_email: linkedUserEmail,
      })
      .select("id")
      .single();

    if (regErr || !reg) {
      console.error("[it-run/register] reg insert error:", regErr?.message);
      await releaseSeats(db, seatLines);
      await releaseHolds();
      return NextResponse.json({ error: "Failed to create registration" }, { status: 500 });
    }

    // Insert participants
    const partInserts = participants.map((p, idx) => ({
      registration_id:    reg.id,
      event_id:           primary.event_id,
      category_id:        participantCategoryIds[idx],
      team_key:           participantTeamKeys[idx],
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
      company_id_url:     p.companyIdUrl || null,
      id_document_type:   idDocumentTypeFor(p.companyIdUrl, p.idDocumentType),
      tshirt_size:        p.tshirtSize || null,
      medical_conditions: p.medicalConditions?.trim() || null,
      food_preference:    p.foodPreference || null,
      // Children are exempt from company verification and are recorded as verified.
      // so they never appear in the pending-verification admin queue.
      // Decided from the stored document, never from a client-supplied status. No ID = not_provided (not a failure).
      verification_status: initialVerificationStatus(participantMeta[idx]?.is_child ?? false, p.companyIdUrl),
    }));

    const { data: parts, error: partErr } = await db
      .from("it_run_participants")
      .insert(partInserts)
      .select("id");

    if (partErr || !parts) {
      console.error("[it-run/register] participant insert error:", partErr?.message);
      await db.from("it_run_registrations").delete().eq("id", reg.id);
      await releaseSeats(db, seatLines);
      await releaseHolds();
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
      await releaseSeats(db, seatLines);
      await releaseHolds();
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
    if (couponId && discountAmt > 0 && couponReserved) {
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
    // A free registration still waits for ID verification: it gets the received notice now, and the confirmation later.
    if (finalPrice === 0) {
      runAfterResponse("free_received", () => sendItRunPaymentReceivedEmail(reg.id));
    }

    // Mark the draft this registration came from as converted, so it can't be saved over afterwards.
    // Best effort: the registration already exists; an unmarked draft only costs a stale resume prompt.
    if (isWellFormedDraftToken(draftToken)) {
      await db
        .from("it_run_drafts")
        .update({ status: "converted", registration_id: reg.id })
        .eq("token_hash", hashDraftToken(draftToken))
        .eq("status", "open")
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
