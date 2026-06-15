-- ── Date of birth fields on users ────────────────────────────────────────────
-- date_of_birth  : canonical storage (DATE)
-- birth_day      : extracted day-of-month for O(1) birthday query
-- birth_month    : extracted month number for O(1) birthday query
-- birthday_email_sent : last date an automated birthday email was sent (dedup)
-- birthday_wa_sent    : last date an automated birthday WA was sent    (dedup)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS date_of_birth       DATE,
  ADD COLUMN IF NOT EXISTS birth_day           SMALLINT,
  ADD COLUMN IF NOT EXISTS birth_month         SMALLINT,
  ADD COLUMN IF NOT EXISTS birthday_email_sent DATE,
  ADD COLUMN IF NOT EXISTS birthday_wa_sent    DATE;

-- Back-fill birth_day / birth_month for any rows that already have a DOB
UPDATE public.users
   SET birth_day   = EXTRACT(DAY   FROM date_of_birth)::SMALLINT,
       birth_month = EXTRACT(MONTH FROM date_of_birth)::SMALLINT
 WHERE date_of_birth IS NOT NULL
   AND (birth_day IS NULL OR birth_month IS NULL);

-- ── App-wide key/value settings ───────────────────────────────────────────────
-- Used for admin-editable toggles (birthday email on/off, WA on/off, etc.)
-- Service role only — no direct client access.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- No anon or authenticated access — all reads/writes go through service role
CREATE POLICY "no_public_access" ON public.app_settings
  USING (false)
  WITH CHECK (false);

-- Default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('birthday_email_enabled', 'true'),
  ('birthday_wa_enabled',    'true'),
  ('birthday_wa_template',   'birthday_wishes')
ON CONFLICT (key) DO NOTHING;
