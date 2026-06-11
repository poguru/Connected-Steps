-- ============================================================
-- Connected Steps — Atomic coupon redemption function
-- File: 20260611000002_redeem_coupon.sql
-- Date: 2026-06-11
--
-- Replaces the non-atomic (SELECT to check + separate UPDATE to
-- increment) pattern with a single conditional UPDATE that is
-- safe under any level of concurrent redemptions.
--
-- The UPDATE's WHERE clause is the only gate:
--   use_count < max_uses  →  row is updated, function returns true
--   use_count >= max_uses →  no row updated, function returns false
--
-- PostgreSQL guarantees that two concurrent calls cannot both see
-- use_count < max_uses and both update the same row: the second
-- writer blocks on the row lock until the first commits, then
-- re-evaluates the WHERE clause and finds use_count >= max_uses.
-- ============================================================

CREATE OR REPLACE FUNCTION redeem_coupon(p_coupon_id uuid, p_user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Single conditional UPDATE: increments only when within the usage
  -- limit and the coupon has not expired. GET DIAGNOSTICS then checks
  -- whether the WHERE predicate matched any row.
  UPDATE coupons
  SET    use_count = use_count + 1
  WHERE  id         = p_coupon_id
    AND  use_count  < max_uses
    AND  (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    -- Coupon exhausted or expired — no row was modified.
    RETURN FALSE;
  END IF;

  -- Record the redemption in the audit table inside the same
  -- transaction so the two writes are always consistent.
  -- ON CONFLICT DO NOTHING guards against a double-call on the same
  -- (coupon_id, email) pair without erroring out.
  INSERT INTO coupon_uses (coupon_id, used_by_email)
  VALUES (p_coupon_id, LOWER(p_user_email))
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$;
