-- ─────────────────────────────────────────────────────────────────────────────
-- Connected Steps — Fitness Integration Schema
--
-- Promoted from lib/fitness/migration.sql which was applied manually via the
-- Supabase SQL Editor. This file ensures new environments can be provisioned
-- correctly without the tables being silently missing.
--
-- Tables: activity_sources, user_integrations, synced_activities
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Activity sources (static lookup — add new providers here, never rename)
CREATE TABLE IF NOT EXISTS activity_sources (
  id          TEXT PRIMARY KEY,
  label       TEXT        NOT NULL,
  description TEXT,
  icon        TEXT,
  is_native   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_oauth    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 99,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO activity_sources (id, label, description, icon, is_native, is_oauth, sort_order) VALUES
  ('health_connect', 'Android Health Connect', 'Sync runs and workouts from Android Health Connect', '🤖', TRUE,  FALSE, 1),
  ('apple_health',   'Apple Health',           'Sync runs and workouts from Apple HealthKit (iOS)',  '🍎', TRUE,  FALSE, 2),
  ('garmin',         'Garmin Connect',          'Sync activities from your Garmin device',            '⌚', FALSE, TRUE,  3),
  ('fitbit',         'Fitbit',                  'Sync activities and steps from Fitbit',              '💪', FALSE, TRUE,  4),
  ('strava',         'Strava',                  'Sync runs from Strava',                              '🏃', FALSE, TRUE,  5),
  ('coros',          'COROS',                   'Sync workouts from COROS watch (coming soon)',       '⌚', FALSE, TRUE,  6),
  ('polar',          'Polar Flow',              'Sync workouts from Polar watch (coming soon)',       '⌚', FALSE, TRUE,  7),
  ('manual',         'Manual Entry',            'Activities logged manually in the app',              '✏️', FALSE, FALSE, 99)
ON CONFLICT (id) DO NOTHING;

-- 2. One row per user per provider
CREATE TABLE IF NOT EXISTS user_integrations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email       TEXT        NOT NULL,
  provider         TEXT        NOT NULL REFERENCES activity_sources(id),
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','active','paused','error','revoked')),
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  external_user_id TEXT,
  scopes           TEXT[]      DEFAULT '{}',
  last_sync_at     TIMESTAMPTZ,
  last_sync_count  INTEGER     NOT NULL DEFAULT 0,
  total_synced     INTEGER     NOT NULL DEFAULT 0,
  error_message    TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_email, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_email   ON user_integrations (user_email);
CREATE INDEX IF NOT EXISTS idx_user_integrations_status  ON user_integrations (status);

-- 3. All activities from all providers (single canonical table)
CREATE TABLE IF NOT EXISTS synced_activities (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email       TEXT        NOT NULL,
  source           TEXT        NOT NULL REFERENCES activity_sources(id),
  external_id      TEXT        NOT NULL,
  activity_type    TEXT        NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL,
  duration_secs    INTEGER,
  distance_m       NUMERIC(10,2),
  avg_pace_secs_km INTEGER,
  calories         INTEGER,
  avg_heart_rate   INTEGER,
  steps            INTEGER,
  elevation_gain_m NUMERIC(8,2),
  cs_points        INTEGER     NOT NULL DEFAULT 0,
  raw_data         JSONB       NOT NULL DEFAULT '{}',
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_email, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_activities_email      ON synced_activities (user_email);
CREATE INDEX IF NOT EXISTS idx_synced_activities_started_at ON synced_activities (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_synced_activities_source     ON synced_activities (source);

-- 4. Auto-update updated_at on user_integrations
CREATE OR REPLACE FUNCTION update_user_integrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_user_integrations_updated_at ON user_integrations;
CREATE TRIGGER trg_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_user_integrations_updated_at();

-- 5. RLS — users may only see their own integrations and activities
ALTER TABLE activity_sources   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_activities  ENABLE ROW LEVEL SECURITY;

-- activity_sources is a public lookup table
CREATE POLICY IF NOT EXISTS "activity_sources_public_read"
  ON activity_sources FOR SELECT USING (true);

-- user_integrations: users read/write their own rows only
CREATE POLICY IF NOT EXISTS "user_integrations_own_read"
  ON user_integrations FOR SELECT
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY IF NOT EXISTS "user_integrations_own_write"
  ON user_integrations FOR ALL
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- synced_activities: users read/write their own rows only
CREATE POLICY IF NOT EXISTS "synced_activities_own_read"
  ON synced_activities FOR SELECT
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY IF NOT EXISTS "synced_activities_own_write"
  ON synced_activities FOR ALL
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');
