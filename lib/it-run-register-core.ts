import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase-server";
import { teamKeysByIndex } from "@/lib/it-run-bib";
import { generateRegistrationCode, signItRunQR } from "@/lib/it-run-auth";
import { sendItRunPaymentReceivedEmail } from "@/lib/it-run-email";
import { runAfterResponse } from "@/lib/after-response";
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

/**
 * The one registration flow for IT Run. The public register route and the admin manual-registration route both call
 * createItRunRegistration, so every rule (window, capacity, pricing, coupons, early birds, duplicate runners, ID
 * upload, age, and rollback) is enforced in one place.
 *
 * Admin-created registrations differ in three ways only: they record who created them, they can be complimentary
 * (no payment, with a written reason and the approving admin), and they can carry an idempotency key so a retried
 * request creates one registration. Public registrations write exactly the columns they always did.
 */

export interface ParticipantInput {
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

export type ParticipantMeta = { is_child: boolean; tshirt_sizes: string[] };

/** Metadata for the participant at this position within their own category. */
function participantMetaFor(categoryType: CategoryType, indexInCategory: number): ParticipantMeta {
  const child = isChildPosition(categoryType, indexInCategory);
  return { is_child: child, tshirt_sizes: child ? CHILD_SIZES : ADULT_SIZES };
}

/**
 * Metadata for every participant in booking order. Each category's participants are numbered within that
 * category, so a parent and child pair is read correctly even when several categories share the booking.
 */
export function participantMetaByIndex(categoryIds: string[], typeById: Map<string, CategoryType>): ParticipantMeta[] {
  const positionInCategory = new Map<string, number>();
  return categoryIds.map(id => {
    const position = positionInCategory.get(id) ?? 0;
    positionInCategory.set(id, position + 1);
    return participantMetaFor(typeById.get(id) ?? "solo", position);
  });
}

/** Participant indexes grouped by category, in the order they were entered. */
export function indexesByCategory(categoryIds: string[]): Map<string, number[]> {
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

export function validateParticipants(
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

export interface AdminRegistrationOptions {
  /** The admin who created the registration */
  email: string;
  /** Their role, recorded in the audit log */
  role: string;
  /** No payment is taken. Stored as a free registration, with the reason and the approving admin. */
  complimentary: boolean;
  waiverReason?: string | null;
  /** A key the caller keeps for one submission, so a retried request creates one registration */
  idempotencyKey?: string | null;
}

export interface RegistrationInput {
  categoryId?: string | null;
  couponId?: string | null;
  participants: ParticipantInput[];
  draftToken?: string | null;
  /** The CS account of the signed-in participant, when there is one */
  linkedUserEmail: string | null;
  source: "public" | "admin_manual";
  admin?: AdminRegistrationOptions;
}

export type RegistrationOutcome =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

const fail = (status: number, body: Record<string, unknown>): RegistrationOutcome => ({ ok: false, status, body });
const succeed = (body: Record<string, unknown>): RegistrationOutcome => ({ ok: true, body });

/** Creates one registration for the whole booking: one registration code, one payment, and one row per participant. */
export async function createItRunRegistration(input: RegistrationInput): Promise<RegistrationOutcome> {
  try {
    const { categoryId: bodyCategoryId, couponId, participants, draftToken, linkedUserEmail, source, admin } = input;
    const complimentary = source === "admin_manual" && admin?.complimentary === true;

    if (!Array.isArray(participants) || participants.length === 0) {
      return fail(400, { error: "categoryId and participants are required" });
    }
    const participantCategoryIds = participants.map(p => p.categoryId || bodyCategoryId || "");
    if (participantCategoryIds.some(id => !id)) {
      return fail(400, { error: "categoryId and participants are required" });
    }
    if (complimentary && couponId) {
      return fail(400, { error: "A complimentary registration can't also use a discount code.", code: "COMPLIMENTARY_COUPON" });
    }

    const db: SupabaseClient = getSupabaseServer();

    // A retried admin request returns the registration it already made, instead of making a second one
    if (source === "admin_manual" && admin?.idempotencyKey) {
      const { data: prior } = await db
        .from("it_run_registrations")
        .select("id, registration_code, final_price")
        .eq("idempotency_key", admin.idempotencyKey)
        .maybeSingle<{ id: string; registration_code: string; final_price: number }>();
      if (prior) {
        return succeed({
          registrationId: prior.id,
          registrationCode: prior.registration_code,
          dashboardUrl: buildDashboardUrl(prior.registration_code),
          finalPrice: prior.final_price,
          participantIds: [],
          alreadyCreated: true,
        });
      }
    }

    const uniqueCategoryIds = Array.from(new Set(participantCategoryIds));

    // Fetch every category the booking uses
    const { data: catRows, error: catErr } = await db
      .from("it_run_categories")
      .select("id,event_id,name,category_type,price_rupees,max_participants,is_active")
      .in("id", uniqueCategoryIds)
      .returns<CategoryRow[]>();
    if (catErr || !catRows || catRows.length !== uniqueCategoryIds.length || catRows.some(c => !c.is_active)) {
      return fail(404, { error: "Category not found or inactive" });
    }
    const categoryById = new Map(catRows.map(c => [c.id, c]));
    const primary = categoryById.get(participantCategoryIds[0])!;
    if (catRows.some(c => c.event_id !== primary.event_id)) {
      return fail(400, { error: "All categories in one registration must belong to the same event." });
    }
    const typeById = new Map(catRows.map(c => [c.id, c.category_type]));

    // Check registration window; also fetch event_date for child age validation
    const { data: evStatus } = await db
      .from("it_run_events")
      .select("registration_opens_at,registration_closes_at,event_date")
      .eq("id", primary.event_id)
      .single<{ registration_opens_at: string | null; registration_closes_at: string | null; event_date: string }>();

    // Registration opens at registration_opens_at and closes at registration_closes_at (server clock)
    const window = registrationWindow(evStatus?.registration_opens_at, evStatus?.registration_closes_at, Date.now());
    if (window === "not_open") {
      const opensLabel = evStatus?.registration_opens_at ? formatIst(evStatus.registration_opens_at) : "soon";
      return fail(409, {
        error: `Registration for this event opens on ${opensLabel}.`,
        code: "REGISTRATION_NOT_OPEN",
      });
    }
    if (window === "closed") {
      return fail(409, { error: "Registration for this event is now closed" });
    }

    // Each category must be a valid number of people: individual runners, or whole pairs for duo and kid.
    const groups = indexesByCategory(participantCategoryIds);
    for (const [id, indexes] of groups) {
      const cat = categoryById.get(id)!;
      if (!participantCountAllowed(cat.category_type, indexes.length)) {
        return fail(400, { error: participantCountMessage(cat.category_type, indexes.length), code: "PARTICIPANT_COUNT" });
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
      return fail(503, { error: "Registration is temporarily unavailable. Please try again later." });
    }

    // Server-side participant field validation (authoritative).
    // The client-side form is defence-in-depth only.
    const validationError = validateParticipants(participants, participantMeta, eventDate, todayInIST());
    if (validationError) {
      return fail(400, { error: validationError.message, field: validationError.field, participant_index: validationError.participantIndex });
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
        return fail(500, { error: "We couldn't check your registration right now. Please try again." });
      }
      if (claim.result === "duplicate") {
        return fail(409, {
          error: "These runners already have a registration waiting for payment. Finish that payment, or wait 15 minutes before registering them again.",
          code: "DUPLICATE_REGISTRATION",
        });
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
    // A complimentary registration takes no discount at all: the whole price is waived instead (see below).
    let couponReserved = false;
    const claimedOffers: string[] = [];
    // Releases every hold this request took: its coupon use and any early bird places it claimed.
    const releaseHolds = async () => {
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      if (claimedRunners) void releaseRunnerClaim(db, primary.event_id, leadEmail, runnerMobiles);
      for (const offerId of claimedOffers) void db.rpc("itr_early_bird_release", { p_offer_id: offerId });
    };

    let earlyBirdDiscount = 0;
    let earlyBirdOfferId: string | null = null;
    if (!complimentary) {
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
        return fail(500, { error: "We couldn't check offers right now. Please try again." });
      }

      const offers = (ebOffers ?? []) as EarlyBirdOffer[];
      const applied: Array<{ offerId: string; discount: number }> = [];
      for (const line of lines) {
        const best = bestEarlyBird(line.price, offers.filter(o => o.category_id === line.categoryId), Date.now());
        if (best) applied.push({ offerId: best.offer.id, discount: best.discount });
      }
      if (applied.length > 0 && couponId) {
        return fail(409, {
          error: "An early bird offer applies to a category in this registration, and it can't be combined with a discount code. Remove the code to continue.",
          code: "EARLY_BIRD_NO_COUPON",
        });
      }
      for (const claim of applied) {
        const { data: claimed, error: claimErr } = await db.rpc("itr_early_bird_claim", { p_offer_id: claim.offerId });
        if (claimErr || !claimed) {
          await releaseHolds();
          if (claimErr) {
            console.error("[it-run/register] early bird claim failed:", claimErr.message);
            return fail(500, { error: "We couldn't apply the offer right now. Please try again." });
          }
          return fail(409, {
            error: "An early bird offer in this registration has just sold out or ended. Refresh the page to see the current price.",
            code: "EARLY_BIRD_UNAVAILABLE",
          });
        }
        claimedOffers.push(claim.offerId);
        earlyBirdDiscount += claim.discount;
      }
      // The registration stores one offer for display; each claimed offer is still recorded on its own.
      earlyBirdOfferId = applied[0]?.offerId ?? null;
    }

    // Atomically validate and claim one coupon use.
    // The DB function acquires a FOR UPDATE lock on the coupon row so concurrent
    // uses serialize — the 101st use of a 100-use coupon is impossible.
    // Returns the discount amount in rupees, or NULL if the coupon is invalid,
    // inactive, expired, exhausted, or the order is below the minimum amount.
    let discountAmt = earlyBirdDiscount;
    if (complimentary) {
      discountAmt = basePrice;
    } else if (couponId && claimedOffers.length === 0) {
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
        return fail(500, { error: "Coupon validation failed" });
      }
      const uncovered = couponUncoveredCategories(couponRow?.applicable_category_ids ?? null, uniqueCategoryIds);
      if (uncovered.length > 0) {
        await releaseHolds();
        const names = uncovered.map(id => categoryById.get(id)?.name ?? "a category in this booking").join(", ");
        return fail(409, {
          error: "This discount code doesn't apply to " + names + ". Remove the code, or that category, to continue.",
          code: "COUPON_CATEGORY",
        });
      }

      const { data: couponDiscount, error: couponErr } = await db.rpc("itr_use_coupon", {
        p_coupon_id:  couponId,
        p_event_id:   primary.event_id,
        p_base_price: basePrice,
      });

      if (couponErr) {
        console.error("[it-run/register] coupon RPC error:", couponErr.message);
        await releaseHolds();
        return fail(500, { error: "Coupon validation failed" });
      }

      if (couponDiscount === null) {
        await releaseHolds();
        return fail(409, { error: "Coupon is invalid or no longer available" });
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
        return fail(409, {
          error: "A category in this registration is fully booked. Remove it, or choose another category.",
          code: "CATEGORY_FULL",
        });
      }
      if (reserved === "unavailable") {
        return fail(404, { error: "Category not found or inactive" });
      }
      return fail(500, { error: "Capacity check failed" });
    }

    // Columns that exist only for admin-created registrations. Public inserts never include them, so public
    // registration does not depend on them.
    const adminColumns = source === "admin_manual" && admin ? {
      registration_source: "admin_manual",
      created_by_admin:    admin.email,
      waiver_reason:       complimentary ? (admin.waiverReason?.trim() || null) : null,
      waiver_approved_by:  complimentary ? admin.email : null,
      idempotency_key:     admin.idempotencyKey ?? null,
    } : {};

    // Insert registration
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
        ...adminColumns,
      })
      .select("id")
      .single();

    if (regErr || !reg) {
      console.error("[it-run/register] reg insert error:", regErr?.message);
      await releaseSeats(db, seatLines);
      await releaseHolds();
      return fail(500, { error: "Failed to create registration" });
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
      return fail(500, { error: "Failed to create participant records" });
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
      return fail(500, { error: "Failed to generate QR codes, please try again" });
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

    // Admin-created registrations are audited with who made them and whether a payment was waived
    if (source === "admin_manual" && admin) {
      await db.from("it_run_audit_logs").insert({
        actor_email: admin.email,
        actor_role:  admin.role,
        action:      complimentary ? "admin_manual_registration_complimentary" : "admin_manual_registration",
        entity_type: "registration",
        entity_id:   reg.id,
        detail:      { registration_code: regCode, participants: participants.length, final_price: finalPrice, source: "admin_manual" },
      }).then(() => {}, () => {});
    }

    return succeed({
      registrationId:   reg.id,
      registrationCode: regCode,
      dashboardUrl:     buildDashboardUrl(regCode),
      finalPrice,
      participantIds: parts.map(p => p.id),
    });
  } catch (e: unknown) {
    console.error("[it-run/register] error:", e);
    return fail(500, { error: "Server error" });
  }
}
