-- Execution log for the daily attendance QR automation.
-- Tracks every run (cron and manual) with full outcome details.
-- The admin health dashboard reads this table to show execution history
-- and alert when automation fails.

CREATE TABLE IF NOT EXISTS public.attendance_qr_cron_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_date DATE        NOT NULL,
  triggered_by   TEXT        NOT NULL DEFAULT 'cron',     -- 'cron' | 'manual'
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running','success','partial','failed','skipped')),
  qr_id          UUID        REFERENCES public.daily_attendance_qr(id) ON DELETE SET NULL,
  emails_sent    INTEGER     NOT NULL DEFAULT 0,
  emails_failed  INTEGER     NOT NULL DEFAULT 0,
  error_message  TEXT,
  details        JSONB
);

CREATE INDEX IF NOT EXISTS idx_attendance_qr_cron_log_date
  ON public.attendance_qr_cron_log (execution_date DESC, started_at DESC);

ALTER TABLE public.attendance_qr_cron_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_attendance_qr_cron_log"
  ON public.attendance_qr_cron_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
