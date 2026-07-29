-- ─────────────────────────────────────────────────────────────────────────────
-- Communication Hub — platform-wide campaigns, consent management, unsubscribe
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New preference columns on user_notification_preferences ──────────────────
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS email_community BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_partners  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_birthday  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_festive   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wa_community    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wa_partners     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wa_birthday     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wa_festive      BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Marketing consent on users ────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS marketing_consent        BOOLEAN,
  ADD COLUMN IF NOT EXISTS marketing_consent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_consent_source TEXT,
  ADD COLUMN IF NOT EXISTS privacy_policy_version   TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS terms_version            TEXT DEFAULT '1.0';

-- ── Platform-wide campaigns ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_campaigns (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  description       TEXT,

  channel           TEXT        NOT NULL DEFAULT 'email'
                                CHECK (channel IN ('email', 'whatsapp', 'push')),

  message_type      TEXT        NOT NULL DEFAULT 'general_update'
                                CHECK (message_type IN (
                                  'training_announcement','event_announcement',
                                  'special_event','community_run',
                                  'festive_greeting','birthday_wish',
                                  'sponsor_promotion','venue_change',
                                  'route_map','emergency_notification',
                                  'maintenance_announcement','general_update'
                                )),

  -- TRUE = bypass consent filtering (transactional)
  is_transactional  BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Recipient segment
  segment_type      TEXT        NOT NULL DEFAULT 'all_users',
  segment_config    JSONB       NOT NULL DEFAULT '{}',

  -- Email content
  subject           TEXT,
  html_body         TEXT,
  text_body         TEXT,
  template_id       UUID        REFERENCES comm_templates(id) ON DELETE SET NULL,

  -- WhatsApp content
  wa_template_name  TEXT,
  wa_template_params JSONB      DEFAULT '[]',

  -- Attachments: [{name, mime_type, size, path}]
  attachments       JSONB       NOT NULL DEFAULT '[]',

  -- Scheduling (NULL = send immediately on trigger)
  scheduled_for     TIMESTAMPTZ,

  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed')),

  -- Delivery stats (denormalised for fast reads; updated by cron/trigger)
  recipient_count   INTEGER     NOT NULL DEFAULT 0,
  queued_count      INTEGER     NOT NULL DEFAULT 0,
  sent_count        INTEGER     NOT NULL DEFAULT 0,
  delivered_count   INTEGER     NOT NULL DEFAULT 0,
  failed_count      INTEGER     NOT NULL DEFAULT 0,
  opened_count      INTEGER     NOT NULL DEFAULT 0,
  clicked_count     INTEGER     NOT NULL DEFAULT 0,
  bounced_count     INTEGER     NOT NULL DEFAULT 0,

  -- Link to email_queue batch (one batch per campaign)
  batch_id          UUID,

  created_by        TEXT        REFERENCES users(email) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comm_campaigns_status    ON communication_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_comm_campaigns_channel   ON communication_campaigns(channel);
CREATE INDEX IF NOT EXISTS idx_comm_campaigns_created   ON communication_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_campaigns_scheduled ON communication_campaigns(scheduled_for)
  WHERE status = 'scheduled';

-- ── Link email_queue rows to campaigns ────────────────────────────────────────
ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES communication_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_campaign_id ON email_queue(campaign_id);

-- ── Link wa_message_log rows to campaigns ─────────────────────────────────────
ALTER TABLE wa_message_log
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES communication_campaigns(id) ON DELETE SET NULL;

-- ── Consent audit trail ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_consent_records (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email             TEXT        NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  action                 TEXT        NOT NULL
                                     CHECK (action IN ('initial','opt_in','opt_out','partial_update')),
  preferences_snapshot   JSONB,
  source                 TEXT        NOT NULL
                                     CHECK (source IN ('registration','profile','unsubscribe_link','admin','import')),
  ip_address             TEXT,
  privacy_policy_version TEXT        DEFAULT '1.0',
  terms_version          TEXT        DEFAULT '1.0',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_user ON user_consent_records(user_email, created_at DESC);

-- ── Per-user email unsubscribe tokens (one-click, no login required) ──────────
CREATE TABLE IF NOT EXISTS email_unsubscribe_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT        NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  channel     TEXT        NOT NULL DEFAULT 'email'
                          CHECK (channel IN ('email','whatsapp','all')),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_email ON email_unsubscribe_tokens(user_email);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON email_unsubscribe_tokens(token);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE communication_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consent_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribe_tokens   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svc_all_communication_campaigns" ON communication_campaigns
  USING (auth.role() = 'service_role');

CREATE POLICY "svc_all_consent_records" ON user_consent_records
  USING (auth.role() = 'service_role');

CREATE POLICY "svc_all_unsubscribe_tokens" ON email_unsubscribe_tokens
  USING (auth.role() = 'service_role');

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _fn_comm_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_comm_campaigns_updated_at ON communication_campaigns;
CREATE TRIGGER trg_comm_campaigns_updated_at
  BEFORE UPDATE ON communication_campaigns
  FOR EACH ROW EXECUTE FUNCTION _fn_comm_campaigns_updated_at();

-- ── Cron scheduled-campaigns processor: picks due campaigns and marks sending ─
-- (Triggered by the existing process-scheduled-emails cron or a new one)
-- Handled in app code, not a DB function.
