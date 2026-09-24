-- ============================================================
-- Migration 20260925000009 — IT Run payment lifecycle hardening
--
-- Changes:
--   1. Add 'payment_attempted' to payment_status CHECK constraint
--      (set when Razorpay order is created; clearly distinguishes
--      "not yet initiated" from "payment window open")
--
--   2. Partial UNIQUE index on razorpay_payment_id
--      (DB-level guard: one payment_id can confirm at most one registration)
--
--   3. Update itr_reserve_capacity to also expire
--      'payment_attempted' and 'failed' stale registrations
--      (previously only expired 'pending')
--      Also releases coupon use_count for couponed expired registrations.
-- ============================================================

-- 1. Extend payment_status to include 'payment_attempted'
ALTER TABLE public.it_run_registrations
  DROP CONSTRAINT IF EXISTS it_run_registrations_payment_status_check;

ALTER TABLE public.it_run_registrations
  ADD CONSTRAINT it_run_registrations_payment_status_check
  CHECK (payment_status IN (
    'pending',            -- registration created, payment not yet initiated
    'payment_attempted',  -- Razorpay order created; checkout window open
    'paid',               -- payment confirmed server-side
    'failed',             -- payment explicitly failed (Razorpay event)
    'free',               -- zero-price registration, no payment needed
    'expired'             -- payment TTL lapsed; slot reclaimed
  ));

-- 2. Prevent two registrations from being confirmed with the same payment
--    (a partial index ignores NULLs, so pending rows are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS it_run_regs_payment_id_unique
  ON public.it_run_registrations (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 3. Update itr_reserve_capacity to expire 'payment_attempted' and
--    'failed' stale registrations in addition to 'pending', and also
--    release coupon use_count for the newly-expired rows.
CREATE OR REPLACE FUNCTION public.itr_reserve_capacity(
  p_category_id      UUID,
  p_increment        INTEGER,
  p_payment_ttl_mins INTEGER DEFAULT 15
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cat     RECORD;
  v_expired INTEGER;
BEGIN
  -- Serialize concurrent calls for the same category
  SELECT id, max_participants, current_participants, is_active
  INTO   v_cat
  FROM   public.it_run_categories
  WHERE  id = p_category_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF NOT v_cat.is_active THEN RETURN 'unavailable'; END IF;

  -- Unlimited capacity: skip the check, just increment
  IF v_cat.max_participants IS NULL THEN
    UPDATE public.it_run_categories
    SET    current_participants = current_participants + p_increment
    WHERE  id = p_category_id;
    RETURN 'confirmed';
  END IF;

  -- Expire stale registrations (pending / payment_attempted / failed)
  -- and release their coupon uses atomically while the lock is held.
  WITH expired_regs AS (
    UPDATE public.it_run_registrations
    SET    payment_status = 'expired'
    WHERE  category_id    = p_category_id
      AND  payment_status IN ('pending', 'payment_attempted', 'failed')
      AND  created_at    <= now() - (p_payment_ttl_mins * INTERVAL '1 minute')
    RETURNING participant_count, coupon_id, discount_amount
  ),
  coupon_cleanup AS (
    -- Release one use per expired registration that had a coupon applied.
    -- Groups by coupon in case multiple registrations shared the same code.
    UPDATE public.it_run_coupons c
    SET    use_count = GREATEST(0, c.use_count - agg.cnt)
    FROM (
      SELECT coupon_id, COUNT(*)::INTEGER AS cnt
      FROM   expired_regs
      WHERE  coupon_id IS NOT NULL
        AND  discount_amount > 0
      GROUP  BY coupon_id
    ) agg
    WHERE  c.id = agg.coupon_id
  )
  SELECT COALESCE(SUM(participant_count), 0)
  INTO   v_expired
  FROM   expired_regs;

  IF v_expired > 0 THEN
    UPDATE public.it_run_categories
    SET    current_participants = GREATEST(0, current_participants - v_expired)
    WHERE  id = p_category_id;

    -- Re-read the counter after freeing expired slots
    SELECT current_participants
    INTO   v_cat.current_participants
    FROM   public.it_run_categories
    WHERE  id = p_category_id;
  END IF;

  -- Check capacity
  IF v_cat.current_participants + p_increment > v_cat.max_participants THEN
    RETURN 'full';
  END IF;

  -- Reserve the slots
  UPDATE public.it_run_categories
  SET    current_participants = current_participants + p_increment
  WHERE  id = p_category_id;

  RETURN 'confirmed';
END;
$$;
