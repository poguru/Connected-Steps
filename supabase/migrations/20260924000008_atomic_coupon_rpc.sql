-- ============================================================
-- Migration 20260924000008 — Atomic coupon reservation
--
-- The existing register route contained two bugs:
--   1. use_count was reset to 0 instead of incremented
--   2. The increment was a non-atomic SELECT-then-UPDATE,
--      allowing concurrent uses to exceed max_uses
--
-- This migration creates two RPCs that replace that logic:
--
--   itr_use_coupon   — validates and atomically claims one use
--   itr_release_coupon — releases a use on payment failure or
--                        registration rollback
-- ============================================================

-- itr_use_coupon
--
-- Validates every coupon condition under a FOR UPDATE row lock
-- so concurrent calls for the same coupon serialize at the DB.
-- Returns the discount in rupees when the coupon is accepted,
-- or NULL when any condition fails (not found, inactive,
-- expired, exhausted, or below min_amount).
--
-- Concurrency guarantee:
--   Two simultaneous requests for the last available use:
--   Request 1 acquires the lock, sees use_count = max_uses - 1,
--   increments, releases. Request 2 then reads use_count =
--   max_uses, fails the check, returns NULL. The 101st use of
--   a 100-use coupon is impossible.
CREATE OR REPLACE FUNCTION public.itr_use_coupon(
  p_coupon_id  UUID,
  p_event_id   UUID,
  p_base_price INTEGER
) RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_coupon   RECORD;
  v_discount INTEGER;
BEGIN
  -- Lock row so concurrent calls queue here and read each
  -- other's committed use_count increments.
  SELECT id, event_id, discount_type, discount_value,
         max_uses, use_count, min_amount, expires_at, is_active
  INTO   v_coupon
  FROM   public.it_run_coupons
  WHERE  id = p_coupon_id
  FOR UPDATE;

  -- Return NULL for every rejection condition
  IF NOT FOUND                                             THEN RETURN NULL; END IF;
  IF NOT v_coupon.is_active                                THEN RETURN NULL; END IF;
  IF v_coupon.event_id <> p_event_id                       THEN RETURN NULL; END IF;
  IF v_coupon.expires_at IS NOT NULL
     AND v_coupon.expires_at <= now()                      THEN RETURN NULL; END IF;
  IF v_coupon.max_uses IS NOT NULL
     AND v_coupon.use_count >= v_coupon.max_uses            THEN RETURN NULL; END IF;
  IF v_coupon.min_amount IS NOT NULL
     AND p_base_price < v_coupon.min_amount                THEN RETURN NULL; END IF;

  -- Compute discount to return to the caller
  v_discount := CASE v_coupon.discount_type
    WHEN 'flat' THEN LEAST(v_coupon.discount_value, p_base_price)
    ELSE             ROUND(p_base_price * v_coupon.discount_value / 100.0)
  END;

  -- Atomically increment use_count while the lock is still held
  UPDATE public.it_run_coupons
  SET    use_count = use_count + 1
  WHERE  id = p_coupon_id;

  RETURN v_discount;
END;
$$;

-- itr_release_coupon
--
-- Returns one use to the coupon — called when the registration
-- that applied this coupon is rolled back or its payment fails.
-- Floors at 0 to guard against underflow.
CREATE OR REPLACE FUNCTION public.itr_release_coupon(p_coupon_id UUID)
RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.it_run_coupons
  SET    use_count = GREATEST(0, use_count - 1)
  WHERE  id = p_coupon_id;
END;
$$;
