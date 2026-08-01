-- Campaign-level tracking table for bulk email sends.
-- Each announce/communicate action creates one row here, linked to email_queue
-- by batch_id. The cron worker at /api/cron/email-sender reads this to find
-- active work; pausing/cancelling/resuming only touches this table.

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id             UUID        NOT NULL UNIQUE,
  event_id             UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  subject              TEXT,
  status               TEXT        NOT NULL DEFAULT 'running'
                                   CONSTRAINT email_campaigns_status_chk
                                   CHECK (status IN ('running','paused','completed','cancelled','failed')),
  total_count          INT         NOT NULL DEFAULT 0,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  worker_last_seen_at  TIMESTAMPTZ,
  -- Mutex: updated every ~10s by the active worker; stale if > 120s old.
  -- Prevents two cron invocations from processing the same campaign.
  worker_locked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_batch  ON public.email_campaigns (batch_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns (status) WHERE status = 'running';

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.email_campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow 'cancelled' as a queue status so cancel sets queue rows cleanly
-- rather than marking them as 'failed' (which would pollute failure counts).
ALTER TABLE public.email_queue
  DROP CONSTRAINT IF EXISTS email_queue_status_chk;
ALTER TABLE public.email_queue
  ADD CONSTRAINT email_queue_status_chk
  CHECK (status IN ('queued','sending','delivered','failed','cancelled'));

-- Atomically claim N queued emails for a batch and mark them 'sending'.
-- FOR UPDATE SKIP LOCKED prevents two concurrent callers from claiming the same row.
-- Used by the background cron worker.
CREATE OR REPLACE FUNCTION public.claim_batch_emails(p_batch_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE(
  id              UUID,
  recipient_email TEXT,
  recipient_name  TEXT,
  subject         TEXT,
  html_body       TEXT,
  attempts        SMALLINT,
  attachments     JSONB
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_queue eq
  SET status   = 'sending',
      attempts = attempts + 1
  WHERE eq.id IN (
    SELECT id FROM public.email_queue
    WHERE batch_id = p_batch_id AND status = 'queued'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    eq.id, eq.recipient_email, eq.recipient_name,
    eq.subject, eq.html_body, eq.attempts,
    COALESCE(eq.attachments, '[]'::jsonb);
END;
$$;

NOTIFY pgrst, 'reload schema';
