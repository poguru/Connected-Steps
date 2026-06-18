-- Persistent rate-limit store — survives cold starts across serverless instances.
-- Service role key is used by all API routes; RLS enabled with no policies
-- means only the service role (which bypasses RLS) can read/write this table.

CREATE TABLE IF NOT EXISTS rate_limit_store (
  key          TEXT        PRIMARY KEY,
  failures     INTEGER     NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rate_limit_store ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies → anon + authenticated roles denied.
-- Service role bypasses RLS and is the only accessor.

-- Atomic conditional-increment with window-reset.
-- Two concurrent callers cannot both see the pre-increment value: Postgres
-- row-level locking on the UPSERT target serialises writes to the same key.
CREATE OR REPLACE FUNCTION record_rate_limit_failure(
  p_key       TEXT,
  p_window_ms BIGINT DEFAULT 900000   -- default 15 minutes in milliseconds
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_failures INTEGER;
BEGIN
  INSERT INTO rate_limit_store (key, failures, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE
  SET
    failures     = CASE
      WHEN EXTRACT(EPOCH FROM (NOW() - rate_limit_store.window_start)) * 1000 >= p_window_ms
      THEN 1
      ELSE rate_limit_store.failures + 1
    END,
    window_start = CASE
      WHEN EXTRACT(EPOCH FROM (NOW() - rate_limit_store.window_start)) * 1000 >= p_window_ms
      THEN NOW()
      ELSE rate_limit_store.window_start
    END
  RETURNING failures INTO v_failures;
  RETURN v_failures;
END;
$$;

-- Optional: periodic cleanup of stale entries older than 1 hour.
CREATE OR REPLACE FUNCTION cleanup_rate_limit_store()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM rate_limit_store
  WHERE window_start < NOW() - INTERVAL '1 hour';
$$;
