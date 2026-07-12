-- ── Bug / issue reports from users ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      TEXT,
  user_name       TEXT,
  user_phone      TEXT,
  category        TEXT        NOT NULL,
  -- 'bug' | 'ui' | 'payment' | 'session' | 'event' | 'feature' | 'performance'
  description     TEXT        NOT NULL,
  screenshot_url  TEXT,
  browser         TEXT,
  device          TEXT,
  screen_size     TEXT,
  app_version     TEXT,
  current_url     TEXT,
  console_errors  TEXT,
  status          TEXT        NOT NULL DEFAULT 'open',
  -- 'open' | 'investigating' | 'fixed' | 'released' | 'closed'
  priority        TEXT        NOT NULL DEFAULT 'medium',
  -- 'critical' | 'high' | 'medium' | 'low'
  assigned_to     TEXT,
  admin_notes     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_status_idx    ON public.bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_category_idx  ON public.bug_reports (category, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_user_idx      ON public.bug_reports (user_email, created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (submit a report)
CREATE POLICY "bug_reports_insert" ON public.bug_reports
  FOR INSERT WITH CHECK (true);

-- Only service role reads/updates (admin dashboard uses service role)
CREATE POLICY "bug_reports_no_public_read" ON public.bug_reports
  FOR SELECT USING (false);
