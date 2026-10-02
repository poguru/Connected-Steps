-- ============================================================
-- Migration 20261001000002 — BIB Slot Full CRUD + Coupon Improvements
--
-- Part 1: Add coupon_type, valid_from, applicable_category_ids to it_run_coupons
-- Part 2: Update itr_use_coupon RPC to validate the new columns
--         p_category_id DEFAULT NULL — fully backwards-compatible with existing callers
-- ============================================================

-- Part 1: New columns on it_run_coupons
-- All have safe defaults so existing rows are unaffected.

ALTER TABLE public.it_run_coupons
  ADD COLUMN IF NOT EXISTS coupon_type             TEXT        NOT NULL DEFAULT 'generic'
    CHECK (coupon_type IN ('generic', 'unique')),
  ADD COLUMN IF NOT EXISTS valid_from              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applicable_category_ids UUID[];

-- Part 2: Updated itr_use_coupon RPC
-- Adds:
--   - p_category_id UUID DEFAULT NULL (skips category check when NULL)
--   - valid_from validation
--   - applicable_category_ids validation
-- All existing callers that omit p_category_id continue to work unchanged.
--
-- IMPORTANT: Must drop the old 3-param signature first. PostgreSQL treats
-- functions with different parameter lists as SEPARATE overloads, so
-- CREATE OR REPLACE here would create a second version, making all calls
-- with 3 args ambiguous and causing a runtime error.
DROP FUNCTION IF EXISTS public.itr_use_coupon(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.itr_use_coupon(
  p_coupon_id   UUID,
  p_event_id    UUID,
  p_base_price  INTEGER,
  p_category_id UUID DEFAULT NULL
) RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_coupon   RECORD;
  v_discount INTEGER;
BEGIN
  -- Acquire row lock so concurrent requests serialize here
  SELECT id, event_id, discount_type, discount_value,
         max_uses, use_count, min_amount, expires_at, is_active,
         valid_from, applicable_category_ids
  INTO   v_coupon
  FROM   public.it_run_coupons
  WHERE  id = p_coupon_id
  FOR UPDATE;

  IF NOT FOUND                                              THEN RETURN NULL; END IF;
  IF NOT v_coupon.is_active                                 THEN RETURN NULL; END IF;
  IF v_coupon.event_id <> p_event_id                        THEN RETURN NULL; END IF;
  IF v_coupon.valid_from IS NOT NULL
     AND v_coupon.valid_from > now()                        THEN RETURN NULL; END IF;
  IF v_coupon.expires_at IS NOT NULL
     AND v_coupon.expires_at <= now()                       THEN RETURN NULL; END IF;
  IF v_coupon.max_uses IS NOT NULL
     AND v_coupon.use_count >= v_coupon.max_uses             THEN RETURN NULL; END IF;
  IF v_coupon.min_amount IS NOT NULL
     AND p_base_price < v_coupon.min_amount                 THEN RETURN NULL; END IF;
  -- Category check: skip when p_category_id is NULL or applicable_category_ids is NULL (all categories)
  IF p_category_id IS NOT NULL
     AND v_coupon.applicable_category_ids IS NOT NULL
     AND NOT (p_category_id = ANY(v_coupon.applicable_category_ids))
                                                            THEN RETURN NULL; END IF;

  v_discount := CASE v_coupon.discount_type
    WHEN 'flat' THEN LEAST(v_coupon.discount_value, p_base_price)
    ELSE             ROUND(p_base_price * v_coupon.discount_value / 100.0)
  END;

  UPDATE public.it_run_coupons
  SET    use_count = use_count + 1
  WHERE  id = p_coupon_id;

  RETURN v_discount;
END;
$$;
