-- Breakfast / refreshment verification columns for event_registrations
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS breakfast_availed     BOOLEAN     DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS breakfast_availed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS breakfast_verified_by TEXT;

CREATE INDEX IF NOT EXISTS event_reg_breakfast_idx
  ON public.event_registrations (event_id, breakfast_availed)
  WHERE breakfast_availed = true;
