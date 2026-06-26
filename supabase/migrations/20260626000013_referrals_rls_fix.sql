-- ============================================================
-- Connected Steps — Referrals RLS Fix
-- File: 20260626000013_referrals_rls_fix.sql
--
-- Root cause: The referrals table had RLS ENABLED but ZERO policies.
-- Without an explicit policy, PostgREST cannot INSERT/UPDATE even with
-- the service-role key (PostgREST validates against the policy metadata,
-- not just the Postgres role). This caused:
--   • SELECT  to return empty (PostgREST returns empty set, not an error)
--   • INSERT  to fail: "Could not find the table 'public.referrals' in
--     the schema cache" — PostgREST schema introspection refuses the table
--
-- Fix: Add explicit service_role policy + reload PostgREST schema cache.
-- ============================================================


-- ── 1. Add service_role policy (allows all operations via server routes) ──────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referrals' AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all" ON public.referrals
      FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- ── 2. Ensure the table has the correct structure ─────────────────────────────
-- Safe: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS are no-ops if
-- the table/columns already exist.

CREATE TABLE IF NOT EXISTS public.referrals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code  text        NOT NULL,
  referrer_email text        NOT NULL,
  referred_email text        NOT NULL,
  status         text        NOT NULL DEFAULT 'completed',
  reward_granted boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  rewarded_at    timestamptz,
  UNIQUE (referred_email)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_email);
CREATE INDEX IF NOT EXISTS idx_referrals_code     ON public.referrals(referral_code);


-- ── 3. Ensure referral_summary() RPC exists ───────────────────────────────────
-- The admin referrals API route calls this RPC. If it doesn't exist, the GET
-- request silently fails and shows "No referrals yet".

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


-- ── 4. Reload PostgREST schema cache ─────────────────────────────────────────
-- Tells PostgREST to re-introspect the database schema immediately.
-- Without this, the service_role policy is visible to Postgres but
-- PostgREST still uses its cached (stale) metadata.

NOTIFY pgrst, 'reload schema';
