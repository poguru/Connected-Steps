-- ============================================================
-- Migration 20261020000001 — IT Run email tracking on the existing email queue
--
-- Event updates and confirmation resends are recorded in public.email_queue (the same table the campaigns and the
-- ZeptoMail webhook already use), one row per recipient:
--   * registration_id / participant_id: which registration and runner the email is about
--   * email_type: 'event_update' or 'confirmation_resend' (existing rows keep NULL)
--   * 'accepted': the provider took the message. Not the same as 'delivered', which only the provider's delivery event sets.
--   * html_body is cleared once the message is accepted, so the email content is not kept in the history.
--   * a partial unique index stops the same recipient being queued twice for the same runner in one batch (double clicks, retries).
--
-- Additive, except that html_body becomes nullable and the status list gains 'accepted' and 'bounced'.
-- Not yet applied: needs review and explicit approval before it runs on any database.
-- ============================================================

ALTER TABLE public.email_queue ALTER COLUMN html_body DROP NOT NULL;

ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_status_chk;
ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_status_chk
  CHECK (status IN ('queued', 'sending', 'accepted', 'delivered', 'bounced', 'failed'));

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS registration_id UUID REFERENCES public.it_run_registrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participant_id  UUID REFERENCES public.it_run_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_type      TEXT,
  ADD COLUMN IF NOT EXISTS created_by      TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_email_type_chk;
ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_email_type_chk
  CHECK (email_type IS NULL OR email_type IN ('event_update', 'confirmation_resend'));

-- One queued email per recipient, per runner, per batch, for the IT Run email types only. A confirmation resend can
-- reach the same lead address once per category, so the runner is part of the key.
CREATE UNIQUE INDEX IF NOT EXISTS email_queue_it_run_batch_recipient_uniq
  ON public.email_queue (batch_id, recipient_email, participant_id)
  WHERE email_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_queue_it_run_batch_idx
  ON public.email_queue (batch_id)
  WHERE email_type IS NOT NULL;
