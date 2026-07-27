-- Phase 6: Certificate distribution tracking
-- Adds certificate_issued columns to event_participants so the ops portal
-- certificate role can scan and record certificate collection, matching
-- the pattern used for tshirt, medal, breakfast, and bib.

ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS certificate_issued     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS certificate_issued_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_issued_by  TEXT;

CREATE INDEX IF NOT EXISTS ep_certificate_idx
  ON public.event_participants (event_id, certificate_issued)
  WHERE certificate_issued = TRUE;

NOTIFY pgrst, 'reload schema';
