import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * Atomically claims one use of a coupon.
 *
 * Calls the `redeem_coupon` Postgres function which executes a single
 * conditional UPDATE:
 *
 *   UPDATE coupons SET use_count = use_count + 1
 *   WHERE  id = p_coupon_id
 *     AND  use_count < max_uses
 *     AND  (expires_at IS NULL OR expires_at > now())
 *
 * Returns true  — redemption recorded; use_count was incremented and an
 *                 audit row was inserted into coupon_uses.
 * Returns false — coupon is exhausted or expired; nothing was written.
 *
 * Safe under concurrent calls: Postgres row-level locking ensures the
 * second concurrent caller re-checks the WHERE clause after the first
 * commits and correctly gets false when the limit is reached.
 */
export async function redeemCoupon(couponId: string, userEmail: string): Promise<boolean> {
  const db = getSupabaseServer();

  const { data, error } = await db.rpc("redeem_coupon", {
    p_coupon_id:  couponId,
    p_user_email: userEmail,
  });

  if (error) {
    console.error("[coupon] redeem_coupon RPC error:", error.message);
    return false;
  }

  return data === true;
}
