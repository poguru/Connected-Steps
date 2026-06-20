-- audit_logs: immutable record of all privileged actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  action       TEXT        NOT NULL,
  actor_email  TEXT        NOT NULL,
  target       TEXT,
  detail       JSONB,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by actor or action
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx  ON audit_logs (actor_email);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_time_idx   ON audit_logs (created_at DESC);

-- Enable RLS — only the service role (server) can write; no client reads
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies → only service role bypasses RLS
-- This means client code can never read or write audit_logs directly
