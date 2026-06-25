-- Track confirmation email delivery status per event registration
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_status               TEXT,      -- 'sent' | 'failed' | 'pending'
  ADD COLUMN IF NOT EXISTS email_ses_message_id       TEXT,
  ADD COLUMN IF NOT EXISTS qr_generated_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS event_reg_email_status_idx
  ON public.event_registrations (email_status)
  WHERE email_status IS NOT NULL;
