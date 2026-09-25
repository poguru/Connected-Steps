-- Dedicated T-shirt issuance tracking for IT Run.
-- Separate from it_run_bib_collections so BIB collection and
-- t-shirt issuance can be recorded as distinct events.
--
-- Admin override: replaces the existing row (UPDATE) so UNIQUE is preserved.
-- is_override and override_by record that a re-issuance was authorised.

CREATE TABLE IF NOT EXISTS public.it_run_tshirt_issuances (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID        UNIQUE NOT NULL REFERENCES public.it_run_participants(id) ON DELETE CASCADE,
  volunteer_email TEXT,
  counter_name   TEXT,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_override    BOOLEAN     NOT NULL DEFAULT false,
  override_by    TEXT,
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_it_run_tshirt_participant
  ON public.it_run_tshirt_issuances (participant_id);

ALTER TABLE public.it_run_tshirt_issuances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tshirt_issuances_service_all"
  ON public.it_run_tshirt_issuances FOR ALL
  TO service_role USING (true) WITH CHECK (true);
