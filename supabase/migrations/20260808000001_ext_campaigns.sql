-- ─────────────────────────────────────────────────────────────────────────────
-- External Promotional Campaigns — supplemental schema
-- Adds the minimum missing pieces; reuses existing tables wherever possible.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Unsubscribe tokens for EXTERNAL contacts ───────────────────────────────
-- Cannot reuse email_unsubscribe_tokens — that table has a FK to users(email).
-- External contacts are not platform users, so we need a separate token store.

CREATE TABLE IF NOT EXISTS public.ext_unsubscribe_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,             -- no FK — not a registered user
  token      TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_unsub_email ON public.ext_unsubscribe_tokens (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ext_unsub_token ON public.ext_unsubscribe_tokens (token);

ALTER TABLE public.ext_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_unsub_svc" ON public.ext_unsubscribe_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Sender identity + reply-to on campaigns ────────────────────────────────
-- Allow external campaigns to customise the display name and reply-to address.
-- NULL = use ZeptoMail env-var defaults (existing behaviour unchanged).

ALTER TABLE public.communication_campaigns
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_to    TEXT;

-- ── 3. Propagate sender/reply-to to individual queue rows ─────────────────────
-- campaign-service passes these per-row so sendOne() can apply them without
-- looking up the campaign.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_to    TEXT;

-- ── 4. Unsubscribed count on campaigns ───────────────────────────────────────
-- Track how many recipients clicked Unsubscribe after a campaign was sent.

ALTER TABLE public.communication_campaigns
  ADD COLUMN IF NOT EXISTS unsubscribed_count INTEGER NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
