-- Phase 8: Sponsor Portal
-- Adds sponsor linkage to ops assignments and a lead-capture table.

-- Link an ops assignment to an event_sponsors row (only set when role = 'sponsor')
ALTER TABLE public.event_portal_assignments
  ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES public.event_sponsors(id) ON DELETE SET NULL;

-- Leads captured by sponsors via QR scan at their booth
CREATE TABLE IF NOT EXISTS public.sponsor_leads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_sponsor_id UUID        REFERENCES public.event_sponsors(id) ON DELETE CASCADE,
  assignment_id    UUID        REFERENCES public.event_portal_assignments(id) ON DELETE SET NULL,
  participant_id   UUID        REFERENCES public.event_participants(id) ON DELETE CASCADE,
  first_name       TEXT,
  last_name        TEXT,
  email            TEXT,
  phone            TEXT,
  distance_category TEXT,
  notes            TEXT,
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one lead per participant per sponsor
  UNIQUE (event_sponsor_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_sponsor_leads_event   ON public.sponsor_leads (event_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_leads_sponsor ON public.sponsor_leads (event_sponsor_id, scanned_at DESC);

ALTER TABLE public.sponsor_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.sponsor_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
