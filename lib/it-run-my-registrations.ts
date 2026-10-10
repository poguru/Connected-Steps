/**
 * My Registrations: shaping and validating the list shown to a signed-in participant.
 *
 * The API route fetches rows in separate queries (registrations, participants, BIB collections) and
 * assembles them here. Joining participants and collections inside one PostgREST select would multiply
 * rows and fail on relationships that do not exist (BIB collections hang off participants, not
 * registrations), so the assembly is done in code, with de-duplication by id.
 */

export interface MyRegCategory { name: string; distance_km: number | null; color: string | null; category_type: string }
export interface MyRegEvent { title: string; event_date: string }

export interface MyRegistrationRow {
  id: string;
  registration_code: string;
  payment_status: string;
  registration_status: string;
  final_price: number;
  base_price: number;
  discount_amount: number;
  early_bird_offer_id: string | null;
  participant_count: number;
  created_at: string;
  category: MyRegCategory | null;
  event: MyRegEvent | null;
}

export interface MyRegPricing {
  base_price: number;
  discount_amount: number;
  /** The early bird offer's name, "Discount code" for a coupon, or null when no discount applied. */
  discount_label: string | null;
}

export interface MyRegParticipantRow {
  id: string;
  registration_id: string;
  first_name: string;
  last_name: string;
  participant_type: string;
  bib_number: string | null;
  qr_token: string | null;
  verification_status: string;
}

export interface MyRegCollectionRow { participant_id: string; collected_at: string }

export interface MyRegParticipant {
  id: string;
  first_name: string;
  last_name: string;
  participant_type: string;
  bib_number: string | null;
  qr_token: string | null;
  verification_status: string;
  collected_at: string | null;
}

export interface MyRegActions {
  /** Server-decided: an active paid or free registration may change category (the change route still validates). */
  canChangeCategory: boolean;
  /** An active paid registration with an amount may be sent for refund review. The admin decides and processes. */
  canRequestRefund: boolean;
}

export interface MyRegistration {
  id: string;
  registration_code: string;
  payment_status: string;
  registration_status: string;
  final_price: number;
  participant_count: number;
  created_at: string;
  category: MyRegCategory | null;
  event: MyRegEvent | null;
  pricing: MyRegPricing;
  participants: MyRegParticipant[];
  actions: MyRegActions;
}

/** Label for the discount on a registration, or null when no discount applied. Offer names are looked up by id. */
export function discountLabel(r: Pick<MyRegistrationRow, "discount_amount" | "early_bird_offer_id">, offerNames: Map<string, string>): string | null {
  if (!(r.discount_amount > 0)) return null;
  if (r.early_bird_offer_id) return offerNames.get(r.early_bird_offer_id) ?? "Early bird";
  return "Discount code";
}

/** The lead email may have been stored in any letter case, so both forms are matched. Nothing else is matched. */
export function claimEmailVariants(email: string): string[] {
  const trimmed = email.trim();
  return Array.from(new Set([trimmed, trimmed.toLowerCase()]));
}

/** Combines the three query results. Each registration and participant appears once, however many collection rows a participant has. */
export function buildMyRegistrations(
  regs: MyRegistrationRow[],
  participants: MyRegParticipantRow[],
  collections: MyRegCollectionRow[],
  offerNames: Map<string, string> = new Map(),
  changesOpen = true,
): MyRegistration[] {
  const collectedAt = new Map<string, string>();
  for (const c of collections) {
    if (!collectedAt.has(c.participant_id)) collectedAt.set(c.participant_id, c.collected_at);
  }

  const byRegistration = new Map<string, MyRegParticipant[]>();
  const seenParticipants = new Set<string>();
  for (const p of participants) {
    if (seenParticipants.has(p.id)) continue;
    seenParticipants.add(p.id);
    const list = byRegistration.get(p.registration_id) ?? [];
    list.push({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      participant_type: p.participant_type,
      bib_number: p.bib_number,
      qr_token: p.qr_token,
      verification_status: p.verification_status,
      collected_at: collectedAt.get(p.id) ?? null,
    });
    byRegistration.set(p.registration_id, list);
  }

  const seenRegistrations = new Set<string>();
  const out: MyRegistration[] = [];
  for (const r of regs) {
    if (seenRegistrations.has(r.id)) continue;
    seenRegistrations.add(r.id);
    out.push({
      id: r.id,
      registration_code: r.registration_code,
      payment_status: r.payment_status,
      registration_status: r.registration_status,
      final_price: r.final_price,
      participant_count: r.participant_count,
      created_at: r.created_at,
      category: r.category,
      event: r.event,
      pricing: {
        base_price: r.base_price,
        discount_amount: r.discount_amount,
        discount_label: discountLabel(r, offerNames),
      },
      participants: byRegistration.get(r.id) ?? [],
      actions: {
        // After the participant cutoff nothing can be changed or requested, whatever the registration state
        canChangeCategory: changesOpen && canOfferCategoryChange(r),
        canRequestRefund: changesOpen && canRequestRefund(r),
      },
    });
  }
  return out;
}

// ── Status presentation ───────────────────────────────────────────────────────

export interface StatusView { label: string; color: string; bg: string }

/** Every payment_status the database allows, plus a safe fallback. Unpaid states are never shown as confirmed. */
export function paymentStatusView(paymentStatus: string, registrationStatus: string): StatusView {
  if (registrationStatus === "cancelled") return { label: "Cancelled", color: "#888", bg: "rgba(136,136,136,0.12)" };
  switch (paymentStatus) {
    case "paid":                return { label: "Confirmed", color: "#4ade80", bg: "rgba(74,222,128,0.1)" };
    case "free":                return { label: "Confirmed (free)", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" };
    case "pending":             return { label: "Awaiting payment", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" };
    case "payment_attempted":   return { label: "Payment in progress", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" };
    case "failed":              return { label: "Payment failed", color: "#f87171", bg: "rgba(248,113,113,0.1)" };
    case "expired":             return { label: "Payment expired", color: "#f87171", bg: "rgba(248,113,113,0.1)" };
    case "refunded":            return { label: "Refunded", color: "#888", bg: "rgba(136,136,136,0.12)" };
    case "partially_refunded":  return { label: "Partly refunded", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" };
    default:                    return { label: "Status unavailable", color: "#888", bg: "rgba(136,136,136,0.12)" };
  }
}

/** A short line telling the participant what, if anything, they still need to do. */
export function registrationNote(reg: Pick<MyRegistration, "payment_status" | "registration_status">): string | null {
  if (reg.registration_status === "cancelled") return "This registration has been cancelled.";
  switch (reg.payment_status) {
    case "paid":
    case "free":
      return null;
    case "pending":
    case "payment_attempted":
      return "Payment has not been completed, so this registration is not confirmed yet.";
    case "failed":
    case "expired":
      return "The payment did not go through. Your place is not confirmed. Use View dashboard to see the options.";
    default:
      return null;
  }
}

/** Category changes are offered only for an active, paid or free registration. The server still decides what is allowed. */
export function canOfferCategoryChange(reg: Pick<MyRegistration, "payment_status" | "registration_status">): boolean {
  return reg.registration_status === "active" && (reg.payment_status === "paid" || reg.payment_status === "free");
}

/** A refund can be requested only for an active paid registration with an amount still held. */
export function canRequestRefund(reg: Pick<MyRegistration, "payment_status" | "registration_status" | "final_price">): boolean {
  return reg.registration_status === "active" && reg.final_price > 0 &&
    (reg.payment_status === "paid" || reg.payment_status === "partially_refunded");
}

// ── Response validation (client) ──────────────────────────────────────────────

export type MyRegistrationsLoadFailure = "session" | "server" | "malformed" | "network";

export function loadFailureMessage(kind: MyRegistrationsLoadFailure): string {
  switch (kind) {
    case "session":   return "Your session has ended. Sign in again to see your registrations.";
    case "malformed": return "We received an unexpected response while loading your registrations. Please try again.";
    case "network":   return "We couldn't reach the server. Check your connection and try again.";
    default:          return "We couldn't load your registrations right now. Please try again.";
  }
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNumOrNull = (v: unknown): boolean => v === null || typeof v === "number";

function isCategory(v: unknown): boolean {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return isStr(c.name) && isNumOrNull(c.distance_km) && (c.color === null || isStr(c.color)) && isStr(c.category_type);
}

function isEvent(v: unknown): boolean {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return isStr(e.title) && isStr(e.event_date);
}

function isParticipant(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return isStr(p.id) && isStr(p.first_name) && isStr(p.last_name) && isStr(p.participant_type) &&
    (p.bib_number === null || isStr(p.bib_number)) && (p.qr_token === null || isStr(p.qr_token)) &&
    isStr(p.verification_status) && (p.collected_at === null || isStr(p.collected_at));
}

function isPricing(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.base_price === "number" && typeof p.discount_amount === "number" &&
    (p.discount_label === null || isStr(p.discount_label));
}

function isActions(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return typeof a.canChangeCategory === "boolean" && typeof a.canRequestRefund === "boolean";
}

function isRegistration(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return isStr(r.id) && isStr(r.registration_code) && isStr(r.payment_status) && isStr(r.registration_status) &&
    typeof r.final_price === "number" && typeof r.participant_count === "number" && isStr(r.created_at) &&
    isCategory(r.category) && isEvent(r.event) &&
    Array.isArray(r.participants) && r.participants.every(isParticipant) &&
    isPricing(r.pricing) && isActions(r.actions);
}

/** Whether participant changes are open. Fails closed: anything other than an explicit true is treated as closed. */
export function parseChangesOpen(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { participantChangesOpen?: unknown }).participantChangesOpen === true;
}

/** Number of registrations made with this email that are not yet on any account. 0 when absent or malformed. */
export function parseClaimableCount(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const n = (body as { claimable?: unknown }).claimable;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}

/** Returns the registrations, or null when the body does not have the expected shape. */
export function parseMyRegistrations(body: unknown): MyRegistration[] | null {
  if (!body || typeof body !== "object") return null;
  const list = (body as { registrations?: unknown }).registrations;
  if (!Array.isArray(list)) return null;
  return list.every(isRegistration) ? (list as MyRegistration[]) : null;
}
