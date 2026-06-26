-- ============================================================
-- Connected Steps — Admin Panel Optimisation
-- File: 20260626000008_admin_exports.sql
--
-- 1. admin_exports table — tracks background CSV/ZIP export jobs
-- 2. membership_stats()  — single-pass aggregate for admin/memberships
-- 3. registration_summary() — aggregate for admin/events/registrations
-- 4. referral_summary()  — aggregate for admin/referrals
--
-- These RPCs replace N parallel PostgREST count queries with a single
-- SQL pass over each table, reducing Supabase Nano connection pressure.
-- ============================================================


-- ── 1. admin_exports — background export job tracking ────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_exports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset      TEXT        NOT NULL,                  -- users | memberships | registrations | referrals
  format       TEXT        NOT NULL DEFAULT 'csv',   -- csv | zip
  filters      JSONB       NOT NULL DEFAULT '{}',    -- serialised query params
  status       TEXT        NOT NULL DEFAULT 'pending',
  --                                                 pending | processing | ready | failed
  row_count    INTEGER,
  file_path    TEXT,                                 -- Supabase Storage path
  error        TEXT,
  requested_by TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS admin_exports_requested_by_idx
  ON public.admin_exports (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_exports_status_idx
  ON public.admin_exports (status)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.admin_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.admin_exports
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. membership_stats() — single-pass aggregate ────────────────────────────
-- Returns total, active, expired, expiring-soon counts + total revenue in one
-- table scan.  Replaces 4–5 separate count queries previously fired in parallel.

CREATE OR REPLACE FUNCTION public.membership_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total',        COUNT(*),
    'active',       COUNT(*) FILTER (WHERE status = 'active' AND expires_at > NOW()),
    'expired',      COUNT(*) FILTER (WHERE status <> 'active' OR expires_at <= NOW()),
    'expiringSoon', COUNT(*) FILTER (
                      WHERE status = 'active'
                        AND expires_at > NOW()
                        AND expires_at <= NOW() + INTERVAL '7 days'
                    ),
    'revenue',      COALESCE(SUM(amount_paid), 0)
  ) FROM memberships;
$$;

GRANT  EXECUTE ON FUNCTION public.membership_stats() TO service_role;
REVOKE EXECUTE ON FUNCTION public.membership_stats() FROM PUBLIC;


-- ── 3. registration_summary() — per-event or global ──────────────────────────

CREATE OR REPLACE FUNCTION public.registration_summary(p_event_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total',   COUNT(*),
    'paid',    COUNT(*) FILTER (WHERE payment_status = 'paid'),
    'free',    COUNT(*) FILTER (WHERE payment_status = 'free'),
    'pending', COUNT(*) FILTER (WHERE payment_status = 'pending'),
    'revenue', COALESCE(SUM(final_price) FILTER (WHERE payment_status = 'paid'), 0)
  )
  FROM event_registrations
  WHERE (p_event_id IS NULL OR event_id = p_event_id);
$$;

GRANT  EXECUTE ON FUNCTION public.registration_summary(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.registration_summary(uuid) FROM PUBLIC;


-- ── 4. referral_summary() — summary stats ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.referral_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total',         COUNT(*),
    'successful',    COUNT(*) FILTER (WHERE status = 'reward_issued'),
    'rewardsIssued', COUNT(*) FILTER (WHERE reward_granted = true)
  ) FROM referrals;
$$;

GRANT  EXECUTE ON FUNCTION public.referral_summary() TO service_role;
REVOKE EXECUTE ON FUNCTION public.referral_summary() FROM PUBLIC;
