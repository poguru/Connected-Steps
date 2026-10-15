-- ============================================================
-- Migration 20261015000001 — Participants can be in different categories of one booking
--
-- One registration (one registration code, one payment) may hold participants from several categories.
--   1. it_run_participants.category_id: the category each participant is registered in. Nullable so that rows
--      written before this migration are backfilled from their registration, and a NULL still falls back to
--      registrations.category_id in code and in the functions below.
--   2. Capacity: a booking reserves seats per participant category. All categories of an event are locked
--      together, in id order, so two bookings that share categories serialize the same way.
--      itr_reserve_capacity_multi reserves every line or none. itr_reserve_capacity keeps its signature and
--      now delegates to it, so existing single-category callers behave as before.
--   3. Expired pending bookings give their seats back per participant category, not per registration.
--
-- Additive and idempotent. No registration, payment, QR or participant data is changed except the backfill
-- of the new column. Not yet applied: needs review and explicit approval before it runs on any database.
-- ============================================================

ALTER TABLE public.it_run_participants
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.it_run_categories(id);

UPDATE public.it_run_participants p
SET    category_id = r.category_id
FROM   public.it_run_registrations r
WHERE  p.registration_id = r.id
  AND  p.category_id IS NULL;

CREATE INDEX IF NOT EXISTS it_run_participants_category_idx
  ON public.it_run_participants (category_id);

-- Expires stale bookings of one event and gives back the seats and coupon use they still hold, per participant
-- category. The caller must already hold the locks on the event's categories.
-- A 'failed' booking is expired without giving anything back: its seats and coupon were released when the
-- payment failed (razorpay webhook). Giving them back again would drop the category count below the real number
-- of people. This double release existed before this migration (migration 20260925000009).
CREATE OR REPLACE FUNCTION public.itr_expire_pending_for_event(
  p_event_id    UUID,
  p_ttl_mins    INTEGER
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  WITH stale AS (
    SELECT id, category_id, coupon_id, discount_amount, payment_status AS old_status
    FROM   public.it_run_registrations
    WHERE  event_id       = p_event_id
      AND  payment_status IN ('pending', 'payment_attempted', 'failed')
      AND  created_at    <= now() - (p_ttl_mins * INTERVAL '1 minute')
    FOR UPDATE
  ),
  expired AS (
    UPDATE public.it_run_registrations r
    SET    payment_status = 'expired'
    FROM   stale s
    WHERE  r.id = s.id
    RETURNING s.id, s.category_id, s.coupon_id, s.discount_amount, s.old_status
  ),
  holding AS (
    SELECT * FROM expired WHERE old_status IN ('pending', 'payment_attempted')
  ),
  coupon_cleanup AS (
    -- One use back per held booking that had a coupon applied
    UPDATE public.it_run_coupons c
    SET    use_count = GREATEST(0, c.use_count - agg.cnt)
    FROM (
      SELECT coupon_id, COUNT(*)::INTEGER AS cnt
      FROM   holding
      WHERE  coupon_id IS NOT NULL
        AND  discount_amount > 0
      GROUP  BY coupon_id
    ) agg
    WHERE c.id = agg.coupon_id
    RETURNING c.id
  ),
  freed AS (
    SELECT COALESCE(p.category_id, h.category_id) AS category_id,
           COUNT(*)::INTEGER                      AS cnt
    FROM   holding h
    JOIN   public.it_run_participants p ON p.registration_id = h.id
    GROUP  BY 1
  )
  UPDATE public.it_run_categories c
  SET    current_participants = GREATEST(0, c.current_participants - f.cnt)
  FROM   freed f
  WHERE  c.id = f.category_id;
END;
$$;

-- Reserves seats for several categories at once, all or nothing.
-- p_lines: [{"category_id": "<uuid>", "count": <int>}, ...]; each category should appear once.
-- Returns 'confirmed', 'full' (a line has too few seats left) or 'unavailable' (a category is inactive,
-- missing, or not in the same event).
CREATE OR REPLACE FUNCTION public.itr_reserve_capacity_multi(
  p_lines            JSONB,
  p_payment_ttl_mins INTEGER DEFAULT 15
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event UUID;
  v_line  RECORD;
  v_cat   RECORD;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN 'unavailable';
  END IF;

  SELECT event_id INTO v_event
  FROM   public.it_run_categories
  WHERE  id = (p_lines->0->>'category_id')::UUID;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;

  -- Lock every category of the event, in id order
  PERFORM 1
  FROM   public.it_run_categories
  WHERE  event_id = v_event
  ORDER  BY id
  FOR UPDATE;

  -- Every line must be a valid, active category of this event
  FOR v_line IN
    SELECT (e->>'category_id')::UUID AS category_id,
           (e->>'count')::INTEGER    AS cnt
    FROM   jsonb_array_elements(p_lines) e
  LOOP
    IF v_line.cnt IS NULL OR v_line.cnt < 1 THEN RETURN 'unavailable'; END IF;

    SELECT event_id, max_participants, current_participants, is_active
    INTO   v_cat
    FROM   public.it_run_categories
    WHERE  id = v_line.category_id;

    IF NOT FOUND OR v_cat.event_id <> v_event OR NOT v_cat.is_active THEN
      RETURN 'unavailable';
    END IF;
  END LOOP;

  -- Free seats held by stale pending bookings before counting
  PERFORM public.itr_expire_pending_for_event(v_event, p_payment_ttl_mins);

  -- Check each line against the counts as they are now
  FOR v_line IN
    SELECT (e->>'category_id')::UUID AS category_id,
           (e->>'count')::INTEGER    AS cnt
    FROM   jsonb_array_elements(p_lines) e
  LOOP
    SELECT max_participants, current_participants
    INTO   v_cat
    FROM   public.it_run_categories
    WHERE  id = v_line.category_id;

    IF v_cat.max_participants IS NOT NULL
       AND v_cat.current_participants + v_line.cnt > v_cat.max_participants THEN
      RETURN 'full';
    END IF;
  END LOOP;

  -- Reserve every line
  FOR v_line IN
    SELECT (e->>'category_id')::UUID AS category_id,
           (e->>'count')::INTEGER    AS cnt
    FROM   jsonb_array_elements(p_lines) e
  LOOP
    UPDATE public.it_run_categories
    SET    current_participants = current_participants + v_line.cnt
    WHERE  id = v_line.category_id;
  END LOOP;

  RETURN 'confirmed';
END;
$$;

-- Single-category reservation, kept for existing callers. Same behaviour as before, now through the
-- multi-category function so expiry and locking are identical everywhere.
CREATE OR REPLACE FUNCTION public.itr_reserve_capacity(
  p_category_id      UUID,
  p_increment        INTEGER,
  p_payment_ttl_mins INTEGER DEFAULT 15
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN public.itr_reserve_capacity_multi(
    jsonb_build_array(jsonb_build_object('category_id', p_category_id, 'count', p_increment)),
    p_payment_ttl_mins
  );
END;
$$;
