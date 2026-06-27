-- Persistent queue for bulk email delivery at SES sandbox rate (1 email/second).
-- Every admin send action creates rows here; the UI drives processing one-at-a-time.
-- This prevents ThrottlingException from AWS SES caused by burst sending.

CREATE TABLE IF NOT EXISTS public.email_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID        NOT NULL,                      -- groups all emails from one admin action
  event_id         UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  recipient_email  TEXT        NOT NULL,
  recipient_name   TEXT,
  subject          TEXT        NOT NULL,
  html_body        TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'queued'
                               CONSTRAINT email_queue_status_chk
                               CHECK (status IN ('queued','sending','delivered','failed')),
  attempts         SMALLINT    NOT NULL DEFAULT 0,
  aws_message_id   TEXT,                                      -- SES MessageId on success
  failure_reason   TEXT,                                      -- raw SES/Resend error message
  failure_code     TEXT,                                      -- e.g. 'ThrottlingException', 'rate_limit'
  is_permanent     BOOLEAN,                                   -- true = never retry
  provider         TEXT,                                      -- 'ses' | 'resend'
  http_status      SMALLINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_queue_batch ON public.email_queue (batch_id, status);
CREATE INDEX IF NOT EXISTS idx_email_queue_event ON public.email_queue (event_id);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.email_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Link comm_history rows to a batch for final-state updates
ALTER TABLE public.event_comm_history
  ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Atomically claims the next queued email in a batch and marks it 'sending'.
-- FOR UPDATE SKIP LOCKED prevents double-claiming under concurrent callers.
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
    WHERE batch_id = p_batch_id AND status = 'queued'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING eq.id, eq.recipient_email, eq.recipient_name, eq.subject, eq.html_body, eq.attempts;
END;
$$;

NOTIFY pgrst, 'reload schema';
