-- ============================================================
-- Migration 20261019000001 — Reservation window and renewal (IT Run)
--
--   1. reserved_at: when the current 15-minute payment window started. Existing rows start from created_at.
--   2. The expiry rule runs from reserved_at, so a renewal can restart the window without changing created_at.
--   3. itr_expire_stale_registrations(): expires lapsed registrations for every event, for the scheduled job.
--   4. itr_renew_registration(): renews an expired registration if its seats are still free. It charges the price
--      originally shown, restarts the window, and refuses coupon or early-bird registrations, and any registration
--      with a recorded payment.
--
-- Additive, and CREATE OR REPLACE throughout. Nothing is dropped.
-- Not yet applied: needs review and explicit approval before it is run in any environment.
-- ============================================================

-- ── 1. reserved_at ───────────────────────────────────────────────────────────
ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;

UPDATE public.it_run_registrations
SET    reserved_at = created_at
WHERE  reserved_at IS NULL;

ALTER TABLE public.it_run_registrations
  ALTER COLUMN reserved_at SET DEFAULT now();

-- ── 2. Expiry runs from reserved_at (same logic as before otherwise) ─────────
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
      AND  COALESCE(reserved_at, created_at) <= now() - (p_ttl_mins * INTERVAL '1 minute')
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

-- ── 3. Scheduled sweep: every event, same rule ───────────────────────────────
-- Returns the number of events that were checked. Called by the scheduled job.
CREATE OR REPLACE FUNCTION public.itr_expire_stale_registrations(
  p_ttl_mins INTEGER DEFAULT 15
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  e RECORD;
  n INTEGER := 0;
BEGIN
  FOR e IN
    SELECT DISTINCT event_id
    FROM   public.it_run_registrations
    WHERE  payment_status IN ('pending', 'payment_attempted', 'failed')
  LOOP
    PERFORM public.itr_expire_pending_for_event(e.event_id, p_ttl_mins);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ── 4. Renewal ───────────────────────────────────────────────────────────────
-- Returns 'renewed', or one of: not_found, not_expired, cancelled, discount_not_renewable, payment_recorded,
-- no_runners, full, unavailable. Nothing changes unless the result is 'renewed'.
-- The seats are taken through itr_reserve_capacity_multi, so the same lock and capacity rules apply.
CREATE OR REPLACE FUNCTION public.itr_renew_registration(
  p_registration_id UUID
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reg     RECORD;
  v_status  TEXT;
  v_lines   JSONB;
  v_result  TEXT;
  v_updated INTEGER;
BEGIN
  SELECT id, event_id, category_id, payment_status, registration_status,
         coupon_id, discount_amount, razorpay_order_id
  INTO   v_reg
  FROM   public.it_run_registrations
  WHERE  id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- A pending registration whose window has closed, but which no sweep has reached yet, is expired first with the
  -- same rule. The registration is locked above, so this cannot race with another renewal.
  v_status := v_reg.payment_status;
  IF v_status IN ('pending', 'payment_attempted', 'failed') THEN
    PERFORM public.itr_expire_pending_for_event(v_reg.event_id, 15);
    SELECT payment_status INTO v_status FROM public.it_run_registrations WHERE id = p_registration_id;
  END IF;

  IF v_status IS DISTINCT FROM 'expired' THEN RETURN 'not_expired'; END IF;
  IF v_reg.registration_status = 'cancelled' THEN RETURN 'cancelled'; END IF;

  -- Coupon and early-bird registrations are not renewed here (the price and the discount would need to be
  -- re-decided). The participant is told to contact the organisers.
  IF v_reg.coupon_id IS NOT NULL OR v_reg.discount_amount > 0 THEN
    RETURN 'discount_not_renewable';
  END IF;

  -- A payment already recorded for this order: never take another one
  IF v_reg.razorpay_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.it_run_payments WHERE razorpay_order_id = v_reg.razorpay_order_id
  ) THEN
    RETURN 'payment_recorded';
  END IF;

  -- Seats needed, per category, from the runners still on the registration
  SELECT jsonb_agg(jsonb_build_object('category_id', cid, 'count', cnt))
  INTO   v_lines
  FROM (
    SELECT COALESCE(p.category_id, v_reg.category_id) AS cid, COUNT(*)::INTEGER AS cnt
    FROM   public.it_run_participants p
    WHERE  p.registration_id = v_reg.id
      AND  p.cancelled_at IS NULL
    GROUP  BY 1
  ) x;
  IF v_lines IS NULL THEN RETURN 'no_runners'; END IF;

  v_result := public.itr_reserve_capacity_multi(v_lines, 15);
  IF v_result <> 'confirmed' THEN RETURN v_result; END IF;

  -- The seats are held. Restart the window. The status guard means this changes only a registration still expired.
  UPDATE public.it_run_registrations
  SET    payment_status = 'pending',
         reserved_at    = now()
  WHERE  id = v_reg.id
    AND  payment_status = 'expired';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Raising rolls back the seat reservation above as well
    RAISE EXCEPTION 'renewal of % was not applied: the registration changed while it was being renewed', v_reg.id;
  END IF;

  INSERT INTO public.it_run_audit_logs (event_id, actor_email, actor_role, action, entity_type, entity_id, detail)
  VALUES (v_reg.event_id, 'system', 'system', 'registration_renewed', 'registration', v_reg.id,
          jsonb_build_object('lines', v_lines));

  RETURN 'renewed';
END;
$$;

-- ── Access: the server (service role) only, as the other capacity functions ──
REVOKE EXECUTE ON FUNCTION public.itr_expire_stale_registrations(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.itr_renew_registration(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.itr_expire_stale_registrations(INTEGER) TO service_role;
GRANT  EXECUTE ON FUNCTION public.itr_renew_registration(UUID) TO service_role;
