-- Persistent background job queue.
--
-- Jobs are inserted synchronously by API routes (fast DB insert) and
-- processed asynchronously by the job-worker cron (every minute).
-- FOR UPDATE SKIP LOCKED ensures concurrent workers never claim the same job.
--
-- Status lifecycle: pending → running → done | failed (→ pending on retry) | dead

CREATE TABLE IF NOT EXISTS public.job_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type         TEXT        NOT NULL,
  payload          JSONB       NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'running', 'done', 'failed', 'dead')),
  priority         SMALLINT    NOT NULL DEFAULT 0,      -- higher = processed first
  run_after        TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- supports delayed / retry backoff
  attempts         SMALLINT    NOT NULL DEFAULT 0,
  max_attempts     SMALLINT    NOT NULL DEFAULT 3,
  last_error       TEXT,
  idempotency_key  TEXT        UNIQUE,                  -- prevents duplicate job creation
  claimed_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Worker polling: pending rows ordered by priority then age
CREATE INDEX IF NOT EXISTS job_queue_pending_idx
  ON public.job_queue (priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Monitoring / admin queries: list jobs by status
CREATE INDEX IF NOT EXISTS job_queue_status_created_idx
  ON public.job_queue (status, created_at DESC);

-- ── Atomic claim function ─────────────────────────────────────────────────────
-- Transitions up to p_limit pending → running in a single statement.
-- FOR UPDATE SKIP LOCKED means concurrent worker invocations claim different
-- rows; no two workers ever process the same job.
CREATE OR REPLACE FUNCTION public.claim_next_jobs(p_limit int DEFAULT 15)
RETURNS SETOF public.job_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE job_queue
  SET    status     = 'running',
         attempts   = attempts + 1,
         claimed_at = NOW()
  WHERE  id = ANY (
    SELECT id
    FROM   job_queue
    WHERE  status    = 'pending'
      AND  run_after <= NOW()
    ORDER  BY priority DESC, created_at ASC
    LIMIT  p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

GRANT  EXECUTE ON FUNCTION public.claim_next_jobs(int) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_next_jobs(int) FROM PUBLIC;

-- RLS: workers use the service-role key (bypasses RLS automatically).
-- Enable anyway for defence-in-depth.
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.job_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
