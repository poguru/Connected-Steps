-- Phase 4 Part 3: Queue scaling indexes
--
-- Analysis: three queue hot-paths under high load
--
-- 1. claim_next_jobs (job_queue)
--    Subquery: WHERE status='pending' AND run_after<=NOW()
--              ORDER BY priority DESC, created_at ASC LIMIT 20
--    Current index: job_queue_pending_idx on (priority DESC, created_at ASC)
--                   WHERE status='pending'
--    Gap: run_after is not in the index. During a retry storm (10k jobs with
--         backoff delays), the planner scans all N pending rows in priority order,
--         checking run_after for each. Adding run_after as the leading column
--         lets Postgres do a range scan on run_after<=NOW() first, producing only
--         the due rows, then sort those by priority/created_at for the LIMIT.
--    Trade-off: normal operation (no backoff) is equally fast because run_after
--         defaults to NOW(), so the range covers all pending rows anyway.
--
-- 2. claim_batch_emails (email_queue)
--    Query: WHERE batch_id=X AND status='queued' ORDER BY created_at LIMIT 5
--    Current index: idx_email_queue_batch on (batch_id, status)
--    Gap: created_at not in the index → Postgres must sort matching rows.
--    With 10k queued rows per batch this is a filesort of O(N) entries per
--    claim call (called every ~0.1s). Adding created_at eliminates the sort.
--
-- 3. job_queue dead/failed monitoring (admin + alerting queries)
--    Queries: WHERE status='dead' or WHERE status='failed' AND job_type=X
--    Current: job_queue_status_created_idx on (status, created_at DESC)
--    Gap: no job_type filter coverage — alerting scans all dead rows.
--    Adding job_type covers targeted dead-letter queries per type.

-- ── 1. job_queue: run_after-first index for retry-storm resilience ────────────
-- Covers the claim_next_jobs subquery: run_after<=NOW() → priority/created_at sort
-- Replaces the planner's need to scan all N pending rows when most are in backoff.

CREATE INDEX IF NOT EXISTS idx_job_queue_pending_due
  ON job_queue (run_after ASC, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- ── 2. email_queue: add created_at to batch claim index ──────────────────────
-- Covers: WHERE batch_id=X AND status='queued' ORDER BY created_at ASC LIMIT N
-- Eliminates filesort for every claim_batch_emails call on large batches.

DROP INDEX IF EXISTS idx_email_queue_batch;
CREATE INDEX IF NOT EXISTS idx_email_queue_batch
  ON email_queue (batch_id, status, created_at ASC);

-- ── 3. job_queue: dead-letter by type for targeted alerting ──────────────────
-- Covers: WHERE status='dead' AND job_type=X ORDER BY created_at DESC
-- Used by alerting queries (Part 4) and system-health dead-jobs table.

CREATE INDEX IF NOT EXISTS idx_job_queue_dead_type
  ON job_queue (job_type, created_at DESC)
  WHERE status = 'dead';
