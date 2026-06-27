-- ============================================================
-- Shared event statistics function.
-- Single-pass aggregation that eliminates the N independent
-- recomputations that previously existed across Overview,
-- Analytics, Registrations, and Race Day pages.
--
-- All admin pages that need event metrics MUST use this function.
-- Never compute confirmed/revenue/checked_in independently.
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_stats(p_event_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(

    -- ── Participant counts ──────────────────────────────────────────────────
    'total',        COUNT(*),
    'confirmed',    COUNT(*) FILTER (WHERE status = 'confirmed'),
    'cancelled',    COUNT(*) FILTER (WHERE status = 'cancelled'),
    'pending',      COUNT(*) FILTER (WHERE status NOT IN ('confirmed', 'cancelled')),
    'paid',         COUNT(*) FILTER (WHERE payment_status = 'paid'),
    'free',         COUNT(*) FILTER (WHERE payment_status = 'free'),
    'active',       COUNT(*) FILTER (WHERE status != 'cancelled'),

    -- ── Race day ────────────────────────────────────────────────────────────
    -- checked_in_at exists since the base schema
    'checked_in',   COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL),

    -- ── Revenue ─────────────────────────────────────────────────────────────
    'revenue_collected',     COALESCE(SUM(final_price) FILTER (WHERE payment_status = 'paid'), 0),
    'revenue_pending',       COALESCE(SUM(final_price) FILTER (WHERE payment_status = 'pending'), 0),
    'avg_per_paid',          CASE
                               WHEN COUNT(*) FILTER (WHERE payment_status = 'paid') > 0
                               THEN ROUND(
                                 SUM(final_price) FILTER (WHERE payment_status = 'paid') /
                                 COUNT(*) FILTER (WHERE payment_status = 'paid')
                               )
                               ELSE 0
                             END,

    -- ── Email delivery ───────────────────────────────────────────────────────
    'email_sent',    COUNT(*) FILTER (WHERE email_status = 'sent'),
    'email_failed',  COUNT(*) FILTER (WHERE email_status = 'failed'),
    'email_none',    COUNT(*) FILTER (WHERE email_status IS NULL AND status = 'confirmed'),

    -- ── Distribution by distance category ───────────────────────────────────
    'by_category', (
      SELECT COALESCE(
        jsonb_object_agg(
          COALESCE(distance_category, 'General'),
          jsonb_build_object(
            'total',   cat_total,
            'paid',    cat_paid,
            'free',    cat_free,
            'revenue', cat_revenue,
            'checked_in', cat_checked_in
          )
        ),
        '{}'::jsonb
      )
      FROM (
        SELECT
          distance_category,
          COUNT(*)                                                          AS cat_total,
          COUNT(*) FILTER (WHERE payment_status = 'paid')                  AS cat_paid,
          COUNT(*) FILTER (WHERE payment_status = 'free')                  AS cat_free,
          COALESCE(SUM(final_price) FILTER (WHERE payment_status='paid'),0) AS cat_revenue,
          COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL)                AS cat_checked_in
        FROM public.event_registrations
        WHERE event_id = p_event_id
        GROUP BY distance_category
      ) t
    ),

    -- ── Registration timeline (daily counts for charting) ────────────────────
    'timeline', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('date', day, 'count', cnt)
          ORDER BY day
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT created_at::DATE AS day, COUNT(*) AS cnt
        FROM public.event_registrations
        WHERE event_id = p_event_id
        GROUP BY created_at::DATE
      ) t
    ),

    'computed_at', NOW()

  )
  FROM public.event_registrations
  WHERE event_id = p_event_id;
$$;

-- Grant access to the service role (used by all API routes)
GRANT EXECUTE ON FUNCTION public.event_stats(UUID) TO service_role;

-- ── Optional race-day columns wrapper ──────────────────────────────────────────
-- bib_collected_at and breakfast_availed were added by phase-3 migration.
-- This second function is safe to call even if those columns don't exist —
-- it returns zeros for missing columns via a dynamic query.
-- NOTE: If phase-3 migration has been applied, prefer event_stats() directly.
CREATE OR REPLACE FUNCTION public.event_raceday_stats(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_has_bib    BOOLEAN;
  v_has_bfast  BOOLEAN;
  v_has_cert   BOOLEAN;
BEGIN
  -- Check which optional columns exist
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_registrations' AND column_name='bib_collected_at'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_registrations' AND column_name='breakfast_availed'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_registrations' AND column_name='certificate_generated_at')
  INTO v_has_bib, v_has_bfast, v_has_cert;

  SELECT jsonb_build_object(
    'checked_in',    COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL),
    'bib_collected', CASE WHEN v_has_bib   THEN COUNT(*) FILTER (WHERE bib_collected_at IS NOT NULL) ELSE 0 END,
    'breakfast',     CASE WHEN v_has_bfast THEN COUNT(*) FILTER (WHERE breakfast_availed = true)     ELSE 0 END,
    'certificates',  CASE WHEN v_has_cert  THEN COUNT(*) FILTER (WHERE certificate_generated_at IS NOT NULL) ELSE 0 END
  )
  INTO v_result
  FROM public.event_registrations
  WHERE event_id = p_event_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.event_raceday_stats(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
