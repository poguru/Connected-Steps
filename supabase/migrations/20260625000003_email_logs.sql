CREATE TABLE IF NOT EXISTS public.email_logs (
  id                  BIGSERIAL    PRIMARY KEY,
  event_id            UUID         REFERENCES public.events(id) ON DELETE SET NULL,
  registration_id     TEXT,
  recipient_email     TEXT         NOT NULL,
  recipient_name      TEXT,
  subject             TEXT         NOT NULL,
  status              TEXT         NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_message       TEXT,
  provider            TEXT,
  provider_message_id TEXT,
  retry_count         INTEGER      NOT NULL DEFAULT 0,
  sent_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  batch_id            TEXT
);

CREATE INDEX IF NOT EXISTS email_logs_event_idx   ON public.email_logs (event_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_status_idx  ON public.email_logs (status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS email_logs_batch_idx   ON public.email_logs (batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
-- Service role only
