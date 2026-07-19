-- Migrate session_reminder_log to per-day dedup (from per-session dedup).
-- The new system sends ONE email + ONE WhatsApp per active user per day
-- covering ALL sessions that day, so the dedup key is (user, date, channel).

-- 1. Clear prior log data (reminder system is new; no production records yet)
TRUNCATE TABLE public.session_reminder_log;

-- 2. Drop the FK on session_id so we can make it nullable
ALTER TABLE public.session_reminder_log
  DROP CONSTRAINT IF EXISTS session_reminder_log_session_id_fkey;

-- 3. Make session_id nullable (kept for backward-compat but no longer dedup key)
ALTER TABLE public.session_reminder_log
  ALTER COLUMN session_id DROP NOT NULL;

-- 4. Drop old per-session UNIQUE constraint
ALTER TABLE public.session_reminder_log
  DROP CONSTRAINT IF EXISTS session_reminder_log_user_email_session_id_channel_key;

-- 5. Add new columns
ALTER TABLE public.session_reminder_log
  ADD COLUMN IF NOT EXISTS reminder_date  date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS sessions_count int  NOT NULL DEFAULT 1;

-- 6. Per-day dedup: one entry per user per channel per day
ALTER TABLE public.session_reminder_log
  ADD CONSTRAINT session_reminder_log_user_date_channel_key
  UNIQUE (user_email, reminder_date, channel);

-- 7. Index on reminder_date for the admin logs query
CREATE INDEX IF NOT EXISTS session_reminder_log_date
  ON public.session_reminder_log (reminder_date DESC);

-- 8. Seed audience setting (default: all active members)
INSERT INTO public.app_settings (key, value)
  VALUES ('session_reminder_audience', 'all_active')
  ON CONFLICT (key) DO NOTHING;
