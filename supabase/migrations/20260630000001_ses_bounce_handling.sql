-- SES Bounce and Complaint Handling
-- Required for Amazon SES production access.
-- AWS evaluates whether you handle bounces and complaints before approving accounts.
--
-- ses_events    : Raw event log (bounce, complaint, delivery) from SNS notifications.
-- email_suppression : Addresses that must never receive emails again.

-- ── SES Events log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ses_events (
  id               BIGSERIAL    PRIMARY KEY,
  event_type       TEXT         NOT NULL CHECK (event_type IN ('bounce','complaint','delivery')),
  email            TEXT         NOT NULL,
  ses_message_id   TEXT,
  bounce_type      TEXT,        -- Permanent | Transient | Undetermined
  bounce_sub_type  TEXT,        -- General | NoEmail | Suppressed | etc.
  complaint_type   TEXT,        -- abuse | fraud | virus | other | etc.
  diagnostic_code  TEXT,        -- SMTP diagnostic from receiving server
  is_permanent     BOOLEAN      NOT NULL DEFAULT false,
  raw_event        TEXT,        -- full JSON for debugging
  received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ses_events_email      ON public.ses_events (email);
CREATE INDEX IF NOT EXISTS idx_ses_events_type_time  ON public.ses_events (event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ses_events_message_id ON public.ses_events (ses_message_id) WHERE ses_message_id IS NOT NULL;

ALTER TABLE public.ses_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.ses_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Email Suppression list ─────────────────────────────────────────────────────
-- Addresses here must be skipped in all future sends.
-- Sourced from: permanent bounces, spam complaints, manual unsubscribes.

CREATE TABLE IF NOT EXISTS public.email_suppression (
  email          TEXT         PRIMARY KEY,
  reason         TEXT         NOT NULL CHECK (reason IN ('bounce','complaint','unsubscribe','manual')),
  bounce_type    TEXT,        -- e.g. "Permanent/General" or complaint feedback type
  suppressed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_suppression_reason ON public.email_suppression (reason);

ALTER TABLE public.email_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.email_suppression
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Helper: is_suppressed(email) ──────────────────────────────────────────────
-- Use this in cron jobs before sending bulk email to avoid suppressed addresses.

CREATE OR REPLACE FUNCTION public.is_email_suppressed(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.email_suppression
    WHERE email = lower(p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_email_suppressed(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
