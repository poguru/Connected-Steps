-- Add SES-specific diagnostic columns to email_logs
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS ses_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS aws_request_id  TEXT,
  ADD COLUMN IF NOT EXISTS provider        TEXT DEFAULT 'ses',
  ADD COLUMN IF NOT EXISTS http_status     INTEGER;

CREATE INDEX IF NOT EXISTS email_logs_ses_msg_idx ON public.email_logs (ses_message_id) WHERE ses_message_id IS NOT NULL;
