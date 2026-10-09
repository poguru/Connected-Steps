-- Migration: 20261010000001_it_run_drafts.sql
--
-- Server-side registration drafts for The IT Run Sprint-2 (save and resume).
--
-- A draft is NOT a registration. It holds the participant's in-progress form state only.
-- It never reserves capacity, applies a coupon, creates a Razorpay order, or marks anything paid.
--
-- Access: a draft is identified by a random token that only the browser holds. The database stores
-- a SHA-256 hash of that token. Signed-in owners can also recover their latest draft (owner_email).
-- RLS is enabled with no public policy, so all access goes through server routes.

CREATE TABLE IF NOT EXISTS public.it_run_drafts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES public.it_run_events(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,
  owner_email     TEXT,
  -- open: can be saved and resumed; converted: became a registration; discarded: user started over or it expired
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'converted', 'discarded')),
  -- Optimistic concurrency: every successful save increments version. A save must name the version it saw.
  version         INTEGER     NOT NULL DEFAULT 1 CHECK (version >= 1),
  state           JSONB       NOT NULL CHECK (octet_length(state::text) <= 262144),
  registration_id UUID        REFERENCES public.it_run_registrations(id) ON DELETE SET NULL,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS it_run_drafts_owner_idx
  ON public.it_run_drafts (owner_email, status, saved_at DESC);

CREATE INDEX IF NOT EXISTS it_run_drafts_expiry_idx
  ON public.it_run_drafts (status, expires_at);

ALTER TABLE public.it_run_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS no_access_it_run_drafts ON public.it_run_drafts;
CREATE POLICY no_access_it_run_drafts ON public.it_run_drafts
  FOR ALL USING (false);
