-- Share Hub: analytics table for tracking share events
-- No existing data touched. Additive only.

CREATE TABLE IF NOT EXISTS public.share_events (
  id           BIGSERIAL    PRIMARY KEY,
  content_type TEXT         NOT NULL
                            CHECK (content_type IN ('post','event','session','achievement','certificate','leaderboard','registration')),
  content_id   TEXT         NOT NULL,
  platform     TEXT         NOT NULL
                            CHECK (platform IN ('whatsapp','twitter','facebook','linkedin','telegram','copy','download','native','instagram')),
  user_email   TEXT,
  referrer     TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_events_type_id  ON public.share_events (content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_share_events_platform ON public.share_events (platform);
CREATE INDEX IF NOT EXISTS idx_share_events_created  ON public.share_events (created_at DESC);

ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.share_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
