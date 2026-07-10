-- Tracks every outbound Meta WhatsApp message and delivery status updates
-- received via the /api/webhooks/meta-whatsapp webhook.

CREATE TABLE IF NOT EXISTS public.wa_message_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          TEXT        NOT NULL,
  user_email     TEXT        REFERENCES public.users(email) ON DELETE SET NULL,
  message_id     TEXT        UNIQUE,            -- Meta's wamid (e.g. wamid.xxx)
  template_name  TEXT        NOT NULL,
  purpose        TEXT        NOT NULL DEFAULT 'otp',  -- otp | session_alert | membership | etc.
  status         TEXT        NOT NULL DEFAULT 'sent', -- sent | delivered | read | failed
  failure_reason TEXT,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_log_phone   ON public.wa_message_log (phone);
CREATE INDEX IF NOT EXISTS idx_wa_log_msg_id  ON public.wa_message_log (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_log_sent_at ON public.wa_message_log (sent_at DESC);

-- Auto-update updated_at on status changes
CREATE OR REPLACE FUNCTION public.wa_message_log_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_wa_message_log_updated_at ON public.wa_message_log;
CREATE TRIGGER trg_wa_message_log_updated_at
  BEFORE UPDATE ON public.wa_message_log
  FOR EACH ROW EXECUTE FUNCTION public.wa_message_log_updated_at();

-- RLS
ALTER TABLE public.wa_message_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by API routes)
CREATE POLICY "service_role_all"
  ON public.wa_message_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Admins and coaches can read delivery logs for support
CREATE POLICY "admin_read"
  ON public.wa_message_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = auth.email()
        AND role IN ('admin', 'coach')
    )
  );
