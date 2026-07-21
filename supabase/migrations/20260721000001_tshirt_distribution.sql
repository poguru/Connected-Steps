-- ============================================================
-- Connected Steps — T-Shirt Size Collection & Distribution
-- File: 20260721000001_tshirt_distribution.sql
-- Date: 2026-07-21
--
-- Adds:
--   • events.collect_tshirt          — toggle per event
--   • event_registrations.tshirt_size — participant's chosen size
--   • event_registrations.tshirt_issued — distribution flag
--   • event_tshirt_distributions      — full audit log of issuances
-- ============================================================

-- ── 1. Events: enable/disable t-shirt collection ─────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS collect_tshirt BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Registrations: store chosen size ──────────────────────────────────────
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS tshirt_size TEXT
    CHECK (tshirt_size IN ('XS','S','M','L','XL','XXL','XXXL'));

-- Whether the t-shirt has been physically handed out
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS tshirt_issued     BOOLEAN     NOT NULL DEFAULT false;

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS tshirt_issued_at  TIMESTAMPTZ;

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS tshirt_issued_by  TEXT;   -- volunteer email / name

-- ── 3. T-shirt distribution audit log ────────────────────────────────────────
-- One row per successful issuance attempt. Prevents double-distribution and
-- provides a full audit trail (who issued, which counter, what device).

CREATE TABLE IF NOT EXISTS public.event_tshirt_distributions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  registration_id     UUID        NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  registration_code   TEXT        NOT NULL,
  user_name           TEXT        NOT NULL,
  tshirt_size         TEXT        NOT NULL,
  volunteer_email     TEXT,
  volunteer_name      TEXT,
  counter_number      TEXT,
  remarks             TEXT,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registration_id)   -- prevents duplicate issuances
);

CREATE INDEX IF NOT EXISTS idx_etd_event_id
  ON public.event_tshirt_distributions (event_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_etd_reg_code
  ON public.event_tshirt_distributions (registration_code);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_tshirt_distributions ENABLE ROW LEVEL SECURITY;

-- Service role (used by all API routes) bypasses RLS
CREATE POLICY "etd_service_role_all"
  ON public.event_tshirt_distributions FOR ALL
  TO service_role USING (true) WITH CHECK (true);
