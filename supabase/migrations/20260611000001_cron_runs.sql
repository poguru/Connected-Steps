-- ============================================================
-- Connected Steps — Cron execution protection
-- File: 20260611000001_cron_runs.sql
-- Date: 2026-06-11
--
-- Records one row per (job_name, execution_date).
-- The UNIQUE constraint makes the INSERT fail atomically if the
-- job already ran today — the application layer uses this as an
-- idempotency gate before sending any notifications or emails.
--
-- Access: service role only (RLS enabled, no public policies).
--         The service-role key used by cron routes bypasses RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name       text        NOT NULL,
  execution_date date        NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_name, execution_date)
);

-- Index is implicit from the UNIQUE constraint, but an explicit
-- covering index on (job_name, execution_date) keeps lookups fast
-- if we ever query by job_name alone.
CREATE INDEX IF NOT EXISTS cron_runs_job_date_idx ON cron_runs (job_name, execution_date);

-- RLS: only the service role (server-side cron routes) may read/write.
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
