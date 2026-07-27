-- Integration Platform — API keys, outbound webhooks, import jobs,
-- automation rules, connector configs, and API usage log.
--
-- RLS: every new table follows the existing pattern —
--   service_role has full access (all API routes use service role).
--   anon/authenticated are denied unless explicitly granted.

-- ── 1. API Keys ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL
                    REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  key_prefix       TEXT NOT NULL,           -- first 12 chars of raw key (for lookup)
  key_hash         TEXT NOT NULL UNIQUE,    -- sha256(raw_key) — raw key never stored
  key_type         TEXT NOT NULL DEFAULT 'live'
                    CHECK (key_type IN ('live', 'test')),
  scopes           TEXT[] NOT NULL DEFAULT ARRAY['events:read','registrations:read'],
  -- NULL = never expires
  expires_at       TIMESTAMPTZ,
  last_used_at     TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       TEXT NOT NULL,
  rotated_from     UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_prefix  ON api_keys(key_prefix) WHERE is_active;
CREATE INDEX idx_api_keys_org     ON api_keys(organization_id) WHERE is_active;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_keys FROM anon, authenticated;

-- ── 2. Webhook subscriptions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL
                    REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  events           TEXT[] NOT NULL,         -- e.g. ['registration.created','payment.succeeded']
  signing_secret   TEXT NOT NULL,           -- random 32-byte hex, shown once at creation
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       TEXT NOT NULL,
  description      TEXT,
  -- Rate limit: max deliveries per minute (0 = unlimited)
  rate_limit_rpm   INTEGER NOT NULL DEFAULT 0,
  -- Delivery retry config
  max_attempts     INTEGER NOT NULL DEFAULT 5,
  timeout_seconds  INTEGER NOT NULL DEFAULT 30,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_subs_org    ON webhook_subscriptions(organization_id) WHERE is_active;
CREATE INDEX idx_webhook_subs_events ON webhook_subscriptions USING gin(events);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON webhook_subscriptions FROM anon, authenticated;

-- ── 3. Webhook delivery log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      UUID NOT NULL
                        REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  organization_id      UUID NOT NULL,
  event_type           TEXT NOT NULL,
  payload              JSONB NOT NULL,
  payload_hash         TEXT NOT NULL,       -- sha256(payload) for dedup
  status               TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','success','failed','dead')),
  attempts             INTEGER NOT NULL DEFAULT 0,
  max_attempts         INTEGER NOT NULL DEFAULT 5,
  next_attempt_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at      TIMESTAMPTZ,
  last_status_code     INTEGER,
  last_response_body   TEXT,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ
);

CREATE INDEX idx_wdl_sub_id   ON webhook_delivery_log(subscription_id);
CREATE INDEX idx_wdl_org      ON webhook_delivery_log(organization_id);
CREATE INDEX idx_wdl_status   ON webhook_delivery_log(status, next_attempt_at)
  WHERE status IN ('pending','failed');
CREATE INDEX idx_wdl_payload  ON webhook_delivery_log(payload_hash);

ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON webhook_delivery_log FROM anon, authenticated;

-- ── 4. API usage log (time-series; partition hint for future) ─────────────────

CREATE TABLE IF NOT EXISTS api_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id    UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  endpoint      TEXT NOT NULL,
  method        TEXT NOT NULL,
  status_code   INTEGER NOT NULL,
  latency_ms    INTEGER,
  -- 'YYYY-MM' bucket set by trigger — to_char() is STABLE, not IMMUTABLE,
  -- so it cannot be used in a stored generated column.
  month_bucket  TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep month_bucket in sync with created_at at insert time
CREATE OR REPLACE FUNCTION set_api_usage_log_month_bucket()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.month_bucket := to_char(NEW.created_at, 'YYYY-MM');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_api_usage_log_month_bucket
  BEFORE INSERT ON api_usage_log
  FOR EACH ROW EXECUTE FUNCTION set_api_usage_log_month_bucket();

CREATE INDEX idx_aul_key_month  ON api_usage_log(api_key_id, month_bucket);
CREATE INDEX idx_aul_org_month  ON api_usage_log(organization_id, month_bucket);
-- Drop old rows automatically after 90 days (requires pg_cron or manual cleanup cron)
CREATE INDEX idx_aul_created    ON api_usage_log(created_at);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_usage_log FROM anon, authenticated;

-- ── 5. Automation rules ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS automation_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL
                    REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  trigger_event    TEXT NOT NULL,           -- e.g. 'payment.succeeded'
  -- JSON: { field, operator, value } conditions array (AND logic)
  conditions       JSONB NOT NULL DEFAULT '[]',
  -- JSON: { type, params } action list executed in order
  actions          JSONB NOT NULL DEFAULT '[]',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  run_count        INTEGER NOT NULL DEFAULT 0,
  last_run_at      TIMESTAMPTZ,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_org    ON automation_rules(organization_id) WHERE is_active;
CREATE INDEX idx_automation_trigger ON automation_rules(trigger_event) WHERE is_active;

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON automation_rules FROM anon, authenticated;

-- ── 6. Automation run log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS automation_run_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL,
  trigger_event    TEXT NOT NULL,
  context_data     JSONB,                   -- snapshot of event data that triggered
  status           TEXT NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success','failed','skipped')),
  actions_taken    JSONB,                   -- list of actions that ran
  error            TEXT,
  duration_ms      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_arl_rule    ON automation_run_log(rule_id);
CREATE INDEX idx_arl_org     ON automation_run_log(organization_id);
CREATE INDEX idx_arl_created ON automation_run_log(created_at);

ALTER TABLE automation_run_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON automation_run_log FROM anon, authenticated;

-- ── 7. Import jobs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL
                    REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type      TEXT NOT NULL            -- 'participants','registrations','volunteers',
                                            -- 'merchandise','sponsors','coupons'
                    CHECK (entity_type IN ('participants','registrations','volunteers',
                                          'merchandise','sponsors','coupons')),
  status           TEXT NOT NULL DEFAULT 'validating'
                    CHECK (status IN ('validating','validated','committing','done','error')),
  file_name        TEXT NOT NULL,
  total_rows       INTEGER NOT NULL DEFAULT 0,
  valid_rows       INTEGER NOT NULL DEFAULT 0,
  error_rows       INTEGER NOT NULL DEFAULT 0,
  created_rows     INTEGER NOT NULL DEFAULT 0,
  -- Validation report: array of {row, errors[]}
  validation_report JSONB,
  error_message    TEXT,
  storage_path     TEXT,                    -- Supabase Storage path for the uploaded file
  created_by       TEXT NOT NULL,
  event_id         UUID REFERENCES events(id) ON DELETE SET NULL,
  committed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_org    ON import_jobs(organization_id);
CREATE INDEX idx_import_status ON import_jobs(status, created_at);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON import_jobs FROM anon, authenticated;

-- ── 8. Connector configs ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL
                    REFERENCES organizations(id) ON DELETE CASCADE,
  connector_type   TEXT NOT NULL,           -- 'google_calendar','hubspot','quickbooks',
                                            -- 'mailchimp','strava','s3'
  name             TEXT NOT NULL,
  -- Encrypted config (field names stored plain, values encrypted at app layer)
  config           JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at     TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error  TEXT,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, connector_type)
);

CREATE INDEX idx_connector_org  ON connector_configs(organization_id);

ALTER TABLE connector_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON connector_configs FROM anon, authenticated;

-- ── 9. Claim pending webhooks RPC ─────────────────────────────────────────────
-- Atomically claims up to p_limit pending/failed webhook deliveries.

CREATE OR REPLACE FUNCTION claim_pending_webhooks(p_limit INTEGER DEFAULT 20)
RETURNS SETOF webhook_delivery_log
LANGUAGE sql SECURITY DEFINER
AS $$
  UPDATE webhook_delivery_log
  SET
    status          = 'pending',
    last_attempt_at = now(),
    attempts        = attempts + 1
  WHERE id IN (
    SELECT id FROM webhook_delivery_log
    WHERE status IN ('pending','failed')
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION claim_pending_webhooks(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_pending_webhooks(INTEGER) TO service_role;

-- ── 10. API usage stats aggregate view ───────────────────────────────────────

CREATE OR REPLACE VIEW api_usage_stats AS
SELECT
  api_key_id,
  organization_id,
  month_bucket,
  COUNT(*)                                       AS request_count,
  AVG(latency_ms)::INTEGER                      AS avg_latency_ms,
  COUNT(*) FILTER (WHERE status_code >= 400)    AS error_count,
  COUNT(*) FILTER (WHERE status_code >= 500)    AS server_error_count
FROM api_usage_log
GROUP BY api_key_id, organization_id, month_bucket;

REVOKE ALL ON api_usage_stats FROM anon, authenticated;
GRANT SELECT ON api_usage_stats TO service_role;
