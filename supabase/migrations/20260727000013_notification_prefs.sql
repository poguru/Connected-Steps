-- Participant notification preferences
-- Stores per-user toggles for each notification channel and category.
-- Default: everything enabled. Transactional emails (OTP, receipts) ignore this table.

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_email       TEXT        PRIMARY KEY REFERENCES public.users(email) ON DELETE CASCADE,
  email_events     BOOLEAN     NOT NULL DEFAULT TRUE,
  email_training   BOOLEAN     NOT NULL DEFAULT TRUE,
  email_reminders  BOOLEAN     NOT NULL DEFAULT TRUE,
  email_marketing  BOOLEAN     NOT NULL DEFAULT FALSE,
  wa_events        BOOLEAN     NOT NULL DEFAULT TRUE,
  wa_training      BOOLEAN     NOT NULL DEFAULT TRUE,
  wa_reminders     BOOLEAN     NOT NULL DEFAULT TRUE,
  wa_marketing     BOOLEAN     NOT NULL DEFAULT FALSE,
  push_events      BOOLEAN     NOT NULL DEFAULT TRUE,
  push_training    BOOLEAN     NOT NULL DEFAULT TRUE,
  push_reminders   BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own preferences
CREATE POLICY "users_own_prefs_select" ON public.user_notification_preferences
  FOR SELECT USING (user_email = current_setting('request.jwt.claims', true)::jsonb->>'email');

CREATE POLICY "users_own_prefs_insert" ON public.user_notification_preferences
  FOR INSERT WITH CHECK (user_email = current_setting('request.jwt.claims', true)::jsonb->>'email');

CREATE POLICY "users_own_prefs_update" ON public.user_notification_preferences
  FOR UPDATE USING (user_email = current_setting('request.jwt.claims', true)::jsonb->>'email');

-- Service role can do anything (for server-side code)
CREATE POLICY "service_role_all_prefs" ON public.user_notification_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);
