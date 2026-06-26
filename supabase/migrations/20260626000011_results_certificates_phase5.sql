-- ============================================================
-- Connected Steps — Results & Certificates Phase 5
-- File: 20260626000011_results_certificates_phase5.sql
--
-- Safe additive changes:
--   • ADD COLUMN IF NOT EXISTS on event_registrations
--   • New table: event_results
-- ============================================================


-- ── Certificate tracking on event_registrations ───────────────────────────────

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS certificate_url          TEXT,
  ADD COLUMN IF NOT EXISTS certificate_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS event_reg_certificate_idx
  ON public.event_registrations (event_id, certificate_generated_at)
  WHERE certificate_generated_at IS NOT NULL;


-- ── event_results table ───────────────────────────────────────────────────────
-- Stores race finish results per participant per event.
-- Separate from event_registrations so results can be bulk-imported
-- independently of registration flow.

CREATE TABLE IF NOT EXISTS public.event_results (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  registration_id   UUID        REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  registration_code TEXT,          -- denormalised for easy lookup
  user_email        TEXT        NOT NULL,
  user_name         TEXT        NOT NULL,
  distance_category TEXT,          -- "5K", "10K" etc.
  bib_number        TEXT,          -- for cross-referencing timing chip data

  -- Timing
  gun_time_secs     INTEGER,       -- seconds from gun to finish (for sorting)
  chip_time_secs    INTEGER,       -- net time (chip time)
  finish_time       TEXT,          -- human-readable "01:23:45"
  pace              TEXT,          -- "5:32 /km"

  -- Rankings
  overall_position  INTEGER,       -- overall finisher position
  category_position INTEGER,       -- position within distance_category

  -- Status
  status            TEXT NOT NULL DEFAULT 'finisher',
  -- finisher | dnf (did not finish) | dns (did not start) | dq (disqualified)

  notes             TEXT,          -- admin notes or disqualification reason
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(event_id, user_email)     -- one result row per participant per event
);

CREATE INDEX IF NOT EXISTS event_results_event_idx
  ON public.event_results (event_id, overall_position NULLS LAST);

CREATE INDEX IF NOT EXISTS event_results_category_idx
  ON public.event_results (event_id, distance_category, category_position NULLS LAST);

CREATE INDEX IF NOT EXISTS event_results_bib_idx
  ON public.event_results (bib_number)
  WHERE bib_number IS NOT NULL;

ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public can read results for published events
CREATE POLICY "anon_read_published_results" ON public.event_results
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events WHERE id = event_results.event_id AND status = 'published'
  ));
