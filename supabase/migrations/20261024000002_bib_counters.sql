-- ============================================================
-- Migration 20261024000002 — IT Run BIB collection counters
--
-- Counters are configured by an event admin (no fixed number): each has a label, can be enabled or disabled, and
-- a BIB collection records which counter it was done at. The table is server-only: RLS is on with a deny-all
-- policy, and every read and write goes through the API, which checks the role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.it_run_bib_counters (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        NOT NULL REFERENCES public.it_run_events(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  is_enabled  BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, label)
);

CREATE INDEX IF NOT EXISTS idx_itr_bib_counters_event ON public.it_run_bib_counters (event_id);

ALTER TABLE public.it_run_bib_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS it_run_bib_counters_deny_all ON public.it_run_bib_counters;
CREATE POLICY it_run_bib_counters_deny_all ON public.it_run_bib_counters
  FOR ALL USING (false) WITH CHECK (false);

-- The counter a BIB was collected at. counter_number (text) is kept for existing rows and the audit trail.
ALTER TABLE public.it_run_bib_collections
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.it_run_bib_counters(id) ON DELETE SET NULL;
