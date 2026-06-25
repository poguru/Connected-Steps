/**
 * GST calculation module — configurable rate, never hardcoded.
 * Default rate: 6% (fetched from gst_config table; falls back to 6 if unavailable).
 */

export interface GSTBreakdown {
  subtotal:      number;  // base amount before GST
  gstPercentage: number;  // e.g. 6
  gstAmount:     number;  // rounded to 2 decimal places
  totalAmount:   number;  // subtotal + gstAmount
}

/**
 * Calculate GST breakdown from a total amount (tax-inclusive).
 * Example: paid ₹100 inclusive of 6% GST → subtotal = 94.34, gst = 5.66
 */
export function gstFromInclusive(totalPaid: number, rate: number = 6): GSTBreakdown {
  const subtotal   = Math.round((totalPaid / (1 + rate / 100)) * 100) / 100;
  const gstAmount  = Math.round((totalPaid - subtotal) * 100) / 100;
  return { subtotal, gstPercentage: rate, gstAmount, totalAmount: totalPaid };
}

/**
 * Calculate GST breakdown from a base amount (tax-exclusive).
 * Example: base ₹100 + 6% GST → gst = 6, total = 106
 */
export function gstFromExclusive(baseAmount: number, rate: number = 6): GSTBreakdown {
  const gstAmount  = Math.round(baseAmount * rate / 100 * 100) / 100;
  const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;
  return { subtotal: baseAmount, gstPercentage: rate, gstAmount, totalAmount };
}

/** Fetch current GST rate from DB. Falls back to 6 if unavailable. */
export async function getCurrentGSTRate(): Promise<number> {
  try {
    const { getSupabaseServer } = await import("@/lib/supabase-server");
    const db = getSupabaseServer();
    const { data } = await db
      .from("gst_config")
      .select("rate")
      .order("effective_from", { ascending: false })
      .limit(1)
      .single();
    return data?.rate ?? 6;
  } catch {
    return 6;
  }
}
