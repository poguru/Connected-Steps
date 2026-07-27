-- Phase 5: Scheduled Email Sends
-- Adds scheduling support to the email queue and communication history.
-- Scheduled emails are held in the queue until claim_next_email() is called
-- at or after their scheduled_for time.

-- Add scheduled_for to email_queue
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Add scheduled_for and cancel tracking to event_comm_history
ALTER TABLE public.event_comm_history
  ADD COLUMN IF NOT EXISTS scheduled_for   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recipient_filter TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT,
  ADD COLUMN IF NOT EXISTS batch_id        UUID,
  ADD COLUMN IF NOT EXISTS attachments     JSONB;

CREATE INDEX IF NOT EXISTS email_queue_scheduled_idx
  ON public.email_queue (scheduled_for)
  WHERE status = 'queued' AND scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS comm_history_scheduled_idx
  ON public.event_comm_history (scheduled_for)
  WHERE status = 'scheduled';

-- Replace claim_next_email to respect scheduled_for:
-- only claim rows where scheduled_for IS NULL OR scheduled_for <= NOW()
CREATE OR REPLACE FUNCTION public.claim_next_email(p_batch_id UUID)
RETURNS TABLE(
  id              UUID,
  recipient_email TEXT,
  recipient_name  TEXT,
  subject         TEXT,
  html_body       TEXT,
  attempts        SMALLINT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_queue eq
  SET status   = 'sending',
      attempts = attempts + 1
  WHERE eq.id = (
    SELECT id FROM public.email_queue
    WHERE batch_id     = p_batch_id
      AND status       = 'queued'
      AND (scheduled_for IS NULL OR scheduled_for <= NOW())
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING eq.id, eq.recipient_email, eq.recipient_name, eq.subject, eq.html_body, eq.attempts;
END;
$$;

NOTIFY pgrst, 'reload schema';
