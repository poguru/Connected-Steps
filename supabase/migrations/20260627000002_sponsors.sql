-- Sponsor Management for events.
-- Sponsors are displayed on: event detail page, email templates, certificates.

CREATE TABLE IF NOT EXISTS public.event_sponsors (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  tier          TEXT        NOT NULL DEFAULT 'community'
                            CONSTRAINT event_sponsors_tier_chk
                            CHECK (tier IN ('title','sports','refreshment','hydration','medical','photography','community','support')),
  logo_url      TEXT,
  website_url   TEXT,
  description   TEXT,
  display_order SMALLINT    NOT NULL DEFAULT 0,
  visible       BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_sponsors_event ON public.event_sponsors (event_id, display_order);

ALTER TABLE public.event_sponsors ENABLE ROW LEVEL SECURITY;

-- Admins/coaches can manage; public can read sponsors for published events
CREATE POLICY "service_role_all" ON public.event_sponsors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read" ON public.event_sponsors
  FOR SELECT USING (
    visible = true AND
    event_id IN (SELECT id FROM public.events WHERE status = 'published')
  );

NOTIFY pgrst, 'reload schema';
