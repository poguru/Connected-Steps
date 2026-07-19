-- Reminder log: tracks every channel-level send per (user, session) for dedup.
-- The UNIQUE constraint prevents duplicate reminders even on cron retries.

CREATE TABLE IF NOT EXISTS public.session_reminder_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  text        NOT NULL,
  session_id  uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  channel     text        NOT NULL CHECK (channel IN ('email', 'whatsapp', 'inapp')),
  status      text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_msg   text,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, session_id, channel)
);

CREATE INDEX IF NOT EXISTS session_reminder_log_session ON public.session_reminder_log (session_id);
CREATE INDEX IF NOT EXISTS session_reminder_log_email   ON public.session_reminder_log (user_email);
CREATE INDEX IF NOT EXISTS session_reminder_log_sent    ON public.session_reminder_log (sent_at DESC);

-- Service role only — no public access
ALTER TABLE public.session_reminder_log ENABLE ROW LEVEL SECURITY;

-- Default settings for the daily session reminder cron.
-- Admins can toggle these from /admin/settings/reminders.
INSERT INTO public.app_settings (key, value) VALUES
  ('session_reminder_email_enabled', 'true'),
  ('session_reminder_wa_enabled',    'true'),
  ('session_reminder_inapp_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
