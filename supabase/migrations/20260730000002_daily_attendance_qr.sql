-- ── Daily Attendance QR: Settings, Recipients, QR log, Distribution log ──────
--
-- Four new tables (all with RLS):
--   attendance_qr_settings      — per-location or global config
--   attendance_qr_recipients    — who receives the daily email
--   daily_attendance_qr         — generated QR records
--   daily_qr_distribution_log   — per-recipient delivery audit

-- ─── attendance_qr_settings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_qr_settings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id           UUID        REFERENCES public.training_locations(id) ON DELETE CASCADE,
  generation_time       TEXT        NOT NULL DEFAULT '05:00',  -- HH:MM IST (used by cron)
  validity_minutes      INTEGER     NOT NULL DEFAULT 180,       -- 3 hours
  auto_generate_enabled BOOLEAN     NOT NULL DEFAULT true,
  auto_email_enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id)              -- NULL = global default
);

ALTER TABLE public.attendance_qr_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_qr_settings"
  ON public.attendance_qr_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed global default
INSERT INTO public.attendance_qr_settings (location_id, generation_time, validity_minutes, auto_generate_enabled, auto_email_enabled)
VALUES (NULL, '05:00', 180, true, true)
ON CONFLICT (location_id) DO NOTHING;

-- ─── attendance_qr_recipients ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_qr_recipients (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  location_ids UUID[]      NOT NULL DEFAULT '{}',  -- empty = receives all locations
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

ALTER TABLE public.attendance_qr_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_qr_recipients"
  ON public.attendance_qr_recipients
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed default recipients
INSERT INTO public.attendance_qr_recipients (name, email, location_ids, is_active, created_by)
VALUES
  ('Kalyan',    'pogurukalyan@gmail.com',   '{}', true, 'system'),
  ('Mani',      'manid9866@gmail.com',       '{}', true, 'system'),
  ('Rajesh',    'rajeshreddy416@gmail.com',  '{}', true, 'system'),
  ('Admin',     'info@connectedsteps.in',    '{}', true, 'system')
ON CONFLICT (email) DO NOTHING;

-- ─── daily_attendance_qr ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_attendance_qr (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  UUID        REFERENCES public.training_locations(id) ON DELETE SET NULL,
  date         DATE        NOT NULL,
  token        TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT        NOT NULL DEFAULT 'system',
  expires_at   TIMESTAMPTZ NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT true,   -- false when superseded by re-generation
  UNIQUE NULLS NOT DISTINCT (date, location_id)     -- one active slot per (date, location)
);

CREATE INDEX IF NOT EXISTS idx_daily_attendance_qr_token   ON public.daily_attendance_qr(token);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_qr_date    ON public.daily_attendance_qr(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_qr_expires ON public.daily_attendance_qr(expires_at);

ALTER TABLE public.daily_attendance_qr ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "admin_all_daily_attendance_qr"
  ON public.daily_attendance_qr
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── daily_qr_distribution_log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_qr_distribution_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id            UUID        NOT NULL REFERENCES public.daily_attendance_qr(id) ON DELETE CASCADE,
  recipient_email  TEXT        NOT NULL,
  recipient_name   TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','sent','failed')),
  error_message    TEXT,
  retry_count      INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_qr_dist_log_qr_id ON public.daily_qr_distribution_log(qr_id);

ALTER TABLE public.daily_qr_distribution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_daily_qr_dist_log"
  ON public.daily_qr_distribution_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── daily_attendance_records ────────────────────────────────────────────────
-- Fallback table: records attendance via daily QR when no session exists for that day.

CREATE TABLE IF NOT EXISTS public.daily_attendance_records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id        UUID        NOT NULL REFERENCES public.daily_attendance_qr(id) ON DELETE CASCADE,
  user_email   TEXT        NOT NULL,
  user_name    TEXT,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_id  UUID        REFERENCES public.training_locations(id) ON DELETE SET NULL,
  UNIQUE (qr_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_daily_attendance_records_email ON public.daily_attendance_records(user_email);

ALTER TABLE public.daily_attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_daily_attendance_records"
  ON public.daily_attendance_records
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Users can read their own daily attendance records
CREATE POLICY "user_read_own_daily_attendance"
  ON public.daily_attendance_records
  FOR SELECT
  USING (true);
