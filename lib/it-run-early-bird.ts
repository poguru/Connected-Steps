/**
 * Early bird pricing rules for The IT Run Sprint-2. Pure functions: no database, no clock.
 * The registration route passes the current time and the offers it loaded, and stores the result.
 *
 * Rules (agreed):
 *  - Window: starts_at inclusive, ends_at exclusive. Times are instants; the event timezone is Asia/Kolkata.
 *  - Percent discounts are rounded to the nearest rupee, halves rounded up.
 *  - Fixed discounts are capped so the price never drops below the offer's minimum payable amount.
 *  - Several offers on one category: only the one with the largest discount applies. Ties go to the lower id.
 *  - An early bird and a coupon are never combined (enforced by the caller).
 *  - Prices are per registration (the booking price), not per runner.
 */

export type OfferStatus = "draft" | "active" | "paused" | "archived";
export type DiscountType = "percent" | "fixed";

export interface EarlyBirdOffer {
  id: string;
  category_id: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  starts_at: string;
  ends_at: string;
  status: OfferStatus;
  redemption_limit: number | null;
  redemptions_used: number;
  min_payable_rupees: number;
}

export const PERCENT_MAX = 90;

/** True when `now` is inside the offer's window: starts_at <= now < ends_at. */
export function inWindow(offer: Pick<EarlyBirdOffer, "starts_at" | "ends_at">, nowMs: number): boolean {
  const start = Date.parse(offer.starts_at);
  const end = Date.parse(offer.ends_at);
  return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs < end;
}

/** Whole-rupee discount for a base price, before the minimum-payable cap. Integer arithmetic only. */
export function rawDiscount(basePrice: number, offer: Pick<EarlyBirdOffer, "discount_type" | "discount_value">): number {
  if (offer.discount_type === "percent") {
    // round(base * value / 100), halves up, in integers: floor((2*base*value + 100) / 200)
    return Math.floor((2 * basePrice * offer.discount_value + 100) / 200);
  }
  return Math.min(offer.discount_value, basePrice);
}

/** The discount actually granted: never below the minimum payable amount, never negative. */
export function grantedDiscount(basePrice: number, offer: EarlyBirdOffer): number {
  const raw = rawDiscount(basePrice, offer);
  const maxAllowed = Math.max(0, basePrice - offer.min_payable_rupees);
  return Math.max(0, Math.min(raw, maxAllowed));
}

export function quotaAvailable(offer: Pick<EarlyBirdOffer, "redemption_limit" | "redemptions_used">): boolean {
  return offer.redemption_limit === null || offer.redemptions_used < offer.redemption_limit;
}

export interface AppliedEarlyBird {
  offer: EarlyBirdOffer;
  discount: number;
  finalPrice: number;
}

/**
 * The single early bird offer that applies to a category right now, or null.
 * Considers only active offers inside their window with quota left. Picks the largest discount.
 */
export function bestEarlyBird(basePrice: number, offers: EarlyBirdOffer[], nowMs: number): AppliedEarlyBird | null {
  let best: AppliedEarlyBird | null = null;
  for (const offer of offers) {
    if (offer.status !== "active") continue;
    if (!inWindow(offer, nowMs)) continue;
    if (!quotaAvailable(offer)) continue;
    const discount = grantedDiscount(basePrice, offer);
    if (discount <= 0) continue;
    const candidate = { offer, discount, finalPrice: basePrice - discount };
    if (
      best === null ||
      candidate.discount > best.discount ||
      (candidate.discount === best.discount && candidate.offer.id < best.offer.id)
    ) {
      best = candidate;
    }
  }
  return best;
}

export interface OfferInput {
  name?: unknown;
  category_id?: unknown;
  discount_type?: unknown;
  discount_value?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  redemption_limit?: unknown;
  min_payable_rupees?: unknown;
  status?: unknown;
  notes?: unknown;
}

/**
 * Validates an admin's offer. Returns the cleaned values, or the first problem as a message.
 * Used on create and on every edit, on the server. Never trust the browser's checks.
 */
export function validateOfferInput(
  input: OfferInput,
  basePriceRupees: number,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 3 || name.length > 120) return { ok: false, message: "The offer name must be 3 to 120 characters." };

  if (typeof input.category_id !== "string" || !input.category_id) return { ok: false, message: "Choose a category." };

  if (input.discount_type !== "percent" && input.discount_type !== "fixed") {
    return { ok: false, message: "Discount type must be percent or fixed." };
  }
  const value = Number(input.discount_value);
  if (!Number.isInteger(value) || value <= 0) return { ok: false, message: "The discount must be a whole number above zero." };
  if (input.discount_type === "percent" && value > PERCENT_MAX) {
    return { ok: false, message: `A percentage discount can be at most ${PERCENT_MAX}%.` };
  }
  if (input.discount_type === "fixed" && value >= basePriceRupees) {
    return { ok: false, message: `A fixed discount must be less than the category price of ₹${basePriceRupees}.` };
  }

  const starts = typeof input.starts_at === "string" ? Date.parse(input.starts_at) : NaN;
  const ends = typeof input.ends_at === "string" ? Date.parse(input.ends_at) : NaN;
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) return { ok: false, message: "Start and end date/time are required." };
  if (ends <= starts) return { ok: false, message: "The end time must be after the start time." };

  let limit: number | null = null;
  if (input.redemption_limit !== undefined && input.redemption_limit !== null && input.redemption_limit !== "") {
    const n = Number(input.redemption_limit);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, message: "The redemption limit must be a whole number above zero." };
    limit = n;
  }

  const minPayable = input.min_payable_rupees === undefined || input.min_payable_rupees === "" ? 0 : Number(input.min_payable_rupees);
  if (!Number.isInteger(minPayable) || minPayable < 0 || minPayable >= basePriceRupees) {
    return { ok: false, message: "The minimum payable amount must be zero or more, and below the category price." };
  }

  const status = input.status === undefined ? "draft" : input.status;
  if (!["draft", "active", "paused", "archived"].includes(String(status))) {
    return { ok: false, message: "Status must be draft, active, paused, or archived." };
  }

  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 1000) return { ok: false, message: "Notes must be 1000 characters or fewer." };

  return {
    ok: true,
    value: {
      name,
      category_id: input.category_id,
      discount_type: input.discount_type,
      discount_value: value,
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(ends).toISOString(),
      redemption_limit: limit,
      min_payable_rupees: minPayable,
      status,
      notes: notes || null,
    },
  };
}
