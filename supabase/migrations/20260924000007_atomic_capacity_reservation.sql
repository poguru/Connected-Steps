-- ============================================================
-- Migration 20260924000007 — Atomic capacity reservation
--
-- Adds 'expired' to it_run_registrations.payment_status and
-- creates two PostgreSQL RPCs for safe concurrent capacity
-- management at 3,000+ registrations:
--
--   itr_reserve_capacity  — atomically claim N slots (with
--     built-in expiry of stale pending registrations so
--     abandoned payment attempts don't hold slots forever)
--
--   itr_release_capacity  — return N slots on payment failure
--     or server-side rollback
--
-- Both functions use a FOR UPDATE row lock on it_run_categories
-- so concurrent requests serialize at the DB, not the app.
-- ============================================================

-- 1. Expand payment_status to include 'expired'.
--    'expired' is written by itr_reserve_capacity when a
--    pending registration's payment window has lapsed.
ALTER TABLE public.it_run_registrations
  DROP CONSTRAINT IF EXISTS it_run_registrations_payment_status_check;

ALTER TABLE public.it_run_registrations
  ADD CONSTRAINT it_run_registrations_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'free', 'expired'));

-- 2. itr_reserve_capacity
--
--    Atomically checks and reserves p_increment slots in a
--    category.  As a side-effect it expires stale pending
--    registrations (older than p_payment_ttl_mins) so they
--    don't permanently consume capacity.
--
--    Return values:
--      'confirmed'   — slots reserved; caller should proceed
--      'full'        — no capacity remaining
--      'unavailable' — category not found or inactive
--
--    Concurrency guarantee:
--      The FOR UPDATE lock on it_run_categories serializes all
--      concurrent calls for the same category_id.  When two
--      requests race for the final slot only one will find
--      current_participants + increment <= max_participants;
--      the other will read the already-incremented counter and
--      return 'full'.
CREATE OR REPLACE FUNCTION public.itr_reserve_capacity(
  p_category_id      UUID,
  p_increment        INTEGER,
  p_payment_ttl_mins INTEGER DEFAULT 15
) RETURNS TEXT
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_cat     RECORD;
  v_expired INTEGER;
BEGIN
  -- Acquire a row-level lock on the category.
  -- All concurrent reservation calls for the same category queue here;
  -- each one reads the counter left by the previous committed call.
  SELECT id, max_participants, current_participants, is_active
  INTO   v_cat
  FROM   public.it_run_categories
  WHERE  id = p_category_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'unavailable';
  END IF;

  IF NOT v_cat.is_active THEN
    RETURN 'unavailable';
  END IF;

  -- Unlimited capacity: always confirm immediately.
  IF v_cat.max_participants IS NULL THEN
    UPDATE public.it_run_categories
    SET    current_participants = current_participants + p_increment
    WHERE  id = p_category_id;
    RETURN 'confirmed';
  END IF;

  -- Expire stale pending registrations so they stop consuming capacity.
  -- The CTE atomically transitions them to 'expired' and returns their
  -- participant_count so we can correct the counter in one UPDATE.
  -- Running inside the FOR UPDATE lock keeps this safe from concurrent
  -- drift: no other call can read or modify this category's counter
  -- while we are here.
  WITH expired_regs AS (
    UPDATE public.it_run_registrations
    SET    payment_status = 'expired'
    WHERE  category_id    = p_category_id
      AND  payment_status = 'pending'
      AND  created_at    <= now() - (p_payment_ttl_mins * INTERVAL '1 minute')
    RETURNING participant_count
  )
  SELECT COALESCE(SUM(participant_count), 0)
  INTO   v_expired
  FROM   expired_regs;

  IF v_expired > 0 THEN
    UPDATE public.it_run_categories
    SET    current_participants = GREATEST(0, current_participants - v_expired)
    WHERE  id = p_category_id;

    -- Re-read the corrected counter before the capacity check.
    SELECT current_participants
    INTO   v_cat.current_participants
    FROM   public.it_run_categories
    WHERE  id = p_category_id;
  END IF;

  -- Final capacity check.
  IF v_cat.current_participants + p_increment > v_cat.max_participants THEN
    RETURN 'full';
  END IF;

  -- Reserve: increment the counter while the lock is still held.
  UPDATE public.it_run_categories
  SET    current_participants = current_participants + p_increment
  WHERE  id = p_category_id;

  RETURN 'confirmed';
END;
$$;

-- 3. itr_release_capacity
--
--    Returns p_count previously reserved slots to a category.
--    Called when a registration is rolled back (server error)
--    or when Razorpay reports payment.failed.
--    Floors at 0 to guard against counter underflow.
CREATE OR REPLACE FUNCTION public.itr_release_capacity(
  p_category_id UUID,
  p_count       INTEGER
) RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.it_run_categories
  SET    current_participants = GREATEST(0, current_participants - p_count)
  WHERE  id = p_category_id;
END;
$$;
