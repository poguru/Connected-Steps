/**
 * Commerce pricing helpers — single source of truth for all discount and
 * currency conversions across the platform.
 *
 * Consumers:
 *   • app/api/events/register/route.ts        — calcEventDiscount
 *   • app/api/admin/events/[id]/register/route.ts — calcEventDiscount
 *   • app/api/payment/create-order/route.ts   — applyMembershipDiscount
 *
 * Unit conventions:
 *   Event prices:       rupees (plain number, e.g. 500 = ₹500)
 *   Razorpay amounts:   paise (integer, e.g. 50000 = ₹500)
 */

// ── Currency conversion ───────────────────────────────────────────────────────

/** Converts paise integer → rupees float, rounded to 2 decimal places. */
export function paiseToRupees(p: number): number {
  return Math.round(p) / 100;
}

/** Converts rupees float → paise integer (rounds to avoid floating-point drift). */
export function rupeesToPaise(r: number): number {
  return Math.round(r * 100);
}

// ── Event discount (amount to subtract, in the same unit as `price`) ─────────

/**
 * Calculates the discount amount to subtract from an event price.
 *
 * @param price  Base price (rupees for events; paise for payment orders)
 * @param type   Coupon discount_type: "percentage" | "fixed"
 * @param value  Coupon discount_value (percent points or rupees)
 * @returns      Discount amount — never exceeds `price`, never negative
 *
 * Rules:
 *   percentage: floor(price × value/100), capped at price
 *   fixed:      value (rupees), capped at price
 */
export function calcEventDiscount(
  price: number,
  type:  string,
  value: number,
): number {
  if (type === "percentage") return Math.min(price, Math.round(price * value / 100));
  if (type === "fixed")      return Math.min(price, value);
  return 0;
}

// ── Membership / Razorpay discount (final amount in paise) ───────────────────

/**
 * Applies a coupon to a paise amount and returns the final charge.
 *
 * Minimum charge is ₹1 (100 paise) — Razorpay rejects amounts below this.
 *
 * @param amountPaise  Original amount in paise
 * @param type         Coupon discount_type: "percentage" | "fixed"
 * @param value        Coupon discount_value (percent points or rupees)
 * @returns            Final amount in paise (≥ 100)
 */
export function applyMembershipDiscount(
  amountPaise: number,
  type:        string,
  value:       number,
): number {
  if (type === "percentage") return Math.max(100, Math.round(amountPaise * (1 - value / 100)));
  if (type === "fixed")      return Math.max(100, amountPaise - value * 100);
  return amountPaise;
}

// ── Razorpay platform fee estimate ───────────────────────────────────────────

/** Razorpay domestic fee = 2% + 18% GST on fee ≈ 2.36% total. */
const RAZORPAY_RATE     = 0.02;
const RAZORPAY_GST_RATE = 0.18;

export interface RazorpayFeeBreakdown {
  rpFee:      number; // Razorpay commission (rupees, 2 dp)
  gstOnFee:   number; // GST on commission (rupees, 2 dp)
  totalDeduct: number; // Total deducted from gross (rupees, 2 dp)
  netSettled:  number; // Amount received (rupees, 2 dp)
}

/**
 * Estimates Razorpay payout after platform fees and GST.
 * Used only for display/reporting — actual settlement is from Razorpay.
 */
export function estimateRazorpayFee(grossRupees: number): RazorpayFeeBreakdown {
  const rpFee      = Math.round(grossRupees * RAZORPAY_RATE * 100) / 100;
  const gstOnFee   = Math.round(rpFee * RAZORPAY_GST_RATE * 100) / 100;
  const totalDeduct = Math.round((rpFee + gstOnFee) * 100) / 100;
  const netSettled  = Math.round((grossRupees - totalDeduct) * 100) / 100;
  return { rpFee, gstOnFee, totalDeduct, netSettled };
}
