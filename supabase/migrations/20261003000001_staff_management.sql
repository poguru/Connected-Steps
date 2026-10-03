-- ============================================================
-- Connected Steps - Staff Management & Operations Schema
-- File: 20261003000001_staff_management.sql
-- Date: 2026-10-03
--
-- Tables created:
--   it_run_staff                - Event operational staff
--   it_run_staff_roles          - Predefined staff roles with permissions
--   it_run_event_entitlements   - Unified model: breakfast, goodies, t-shirt, medal, cert
--   it_run_entitlement_issues   - Audit log of all entitlement issuances
--   it_run_staff_activity_log   - Detailed audit of staff race-day actions
--
-- All tables have RLS enabled. Service role bypasses RLS.
-- ============================================================

-- ── Staff Users ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_staff (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  full_name             TEXT        NOT NULL,
  email                 TEXT        NOT NULL,
  mobile                TEXT,
  staff_code            TEXT        NOT NULL,
  -- Password: HMAC-SHA256 hashed server-side. Never stored plaintext.
  password_hash         TEXT        NOT NULL,
  password_salt         BYTEA       NOT NULL,
  role                  TEXT        NOT NULL DEFAULT 'volunteer'
                        CHECK (role IN ('super_admin','event_admin','bib_staff','checkin_staff',
                                       'breakfast_staff','goodies_staff','tshirt_staff',
                                       'medal_staff','volunteer')),
  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','suspended')),
  last_login_at         TIMESTAMPTZ,
  last_login_ip         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, email),
  UNIQUE(event_id, staff_code)
);

CREATE INDEX IF NOT EXISTS idx_staff_event_id ON it_run_staff(event_id);
CREATE INDEX IF NOT EXISTS idx_staff_status ON it_run_staff(status);

-- ── Staff Roles & Permissions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_staff_roles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  role_name             TEXT        NOT NULL,
  permissions           TEXT[]      NOT NULL DEFAULT '{}',
  -- Predefined role: cannot be deleted, but permissions can be customized
  is_predefined         BOOLEAN     NOT NULL DEFAULT false,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, role_name)
);

-- Predefined role permission sets:
INSERT INTO it_run_staff_roles (event_id, role_name, permissions, is_predefined, description)
SELECT
  id,
  'bib_staff',
  ARRAY['BIB_COLLECT', 'PARTICIPANT_SEARCH', 'PARTICIPANT_VIEW'],
  true,
  'Can collect BIBs, search participants'
FROM it_run_events WHERE slug = 'sprint-2'
ON CONFLICT DO NOTHING;

INSERT INTO it_run_staff_roles (event_id, role_name, permissions, is_predefined, description)
SELECT
  id,
  'checkin_staff',
  ARRAY['EVENT_CHECKIN', 'PARTICIPANT_SEARCH', 'PARTICIPANT_VIEW'],
  true,
  'Can check in participants'
FROM it_run_events WHERE slug = 'sprint-2'
ON CONFLICT DO NOTHING;

INSERT INTO it_run_staff_roles (event_id, role_name, permissions, is_predefined, description)
SELECT
  id,
  'breakfast_staff',
  ARRAY['BREAKFAST_ISSUE', 'PARTICIPANT_SEARCH', 'PARTICIPANT_VIEW'],
  true,
  'Can issue breakfast'
FROM it_run_events WHERE slug = 'sprint-2'
ON CONFLICT DO NOTHING;

INSERT INTO it_run_staff_roles (event_id, role_name, permissions, is_predefined, description)
SELECT
  id,
  'goodies_staff',
  ARRAY['GOODIES_ISSUE', 'PARTICIPANT_SEARCH', 'PARTICIPANT_VIEW'],
  true,
  'Can distribute goodies'
FROM it_run_events WHERE slug = 'sprint-2'
ON CONFLICT DO NOTHING;

INSERT INTO it_run_staff_roles (event_id, role_name, permissions, is_predefined, description)
SELECT
  id,
  'tshirt_staff',
  ARRAY['TSHIRT_ISSUE', 'PARTICIPANT_SEARCH', 'PARTICIPANT_VIEW'],
  true,
  'Can issue t-shirts'
FROM it_run_events WHERE slug = 'sprint-2'
ON CONFLICT DO NOTHING;

INSERT INTO it_run_staff_roles (event_id, role_name, permissions, is_predefined, description)
SELECT
  id,
  'medal_staff',
  ARRAY['MEDAL_ISSUE', 'CERTIFICATE_ISSUE', 'PARTICIPANT_SEARCH', 'PARTICIPANT_VIEW'],
  true,
  'Can distribute medals and certificates'
FROM it_run_events WHERE slug = 'sprint-2'
ON CONFLICT DO NOTHING;

INSERT INTO it_run_staff_roles (event_id, role_name, permissions, is_predefined, description)
SELECT
  id,
  'event_admin',
  ARRAY['BIB_COLLECT','EVENT_CHECKIN','BREAKFAST_ISSUE','GOODIES_ISSUE','TSHIRT_ISSUE',
         'MEDAL_ISSUE','CERTIFICATE_ISSUE','PARTICIPANT_SEARCH','PARTICIPANT_VIEW',
         'MANUAL_OVERRIDE','REPORT_VIEW'],
  true,
  'Full event operations access'
FROM it_run_events WHERE slug = 'sprint-2'
ON CONFLICT DO NOTHING;

-- ── Unified Event Entitlements ─────────────────────────────────────────────────
-- Central model for all race-day activities: BIB, breakfast, goodies, t-shirt, medal, cert

CREATE TABLE IF NOT EXISTS it_run_event_entitlements (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  participant_id        UUID        NOT NULL REFERENCES it_run_participants(id) ON DELETE CASCADE,
  registration_id       UUID        NOT NULL REFERENCES it_run_registrations(id) ON DELETE CASCADE,
  entitlement_type      TEXT        NOT NULL
                        CHECK (entitlement_type IN ('BIB','BREAKFAST','GOODIES','TSHIRT','MEDAL','CERTIFICATE')),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','issued','collected','skipped')),
  issued_at             TIMESTAMPTZ,
  issued_by             UUID        REFERENCES it_run_staff(id),
  collected_at          TIMESTAMPTZ,
  collected_by          UUID        REFERENCES it_run_staff(id),
  metadata              JSONB       DEFAULT '{}'::jsonb,
  -- e.g., {"actual_tshirt_size": "L", "override_reason": "size_mismatch"}
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unique: one entitlement per participant per type per event
  UNIQUE(event_id, participant_id, entitlement_type)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_event ON it_run_event_entitlements(event_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_participant ON it_run_event_entitlements(participant_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_type ON it_run_event_entitlements(entitlement_type);
CREATE INDEX IF NOT EXISTS idx_entitlements_status ON it_run_event_entitlements(status);

-- ── Entitlement Issue/Collection Audit Log ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_entitlement_issues (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  participant_id        UUID        NOT NULL REFERENCES it_run_participants(id) ON DELETE CASCADE,
  registration_id       UUID        NOT NULL REFERENCES it_run_registrations(id) ON DELETE CASCADE,
  staff_id              UUID        NOT NULL REFERENCES it_run_staff(id) ON DELETE CASCADE,
  entitlement_type      TEXT        NOT NULL,
  action                TEXT        NOT NULL
                        CHECK (action IN ('issued','collected','skipped','override','failed')),
  idempotency_key       TEXT,
  result                TEXT        NOT NULL DEFAULT 'success'
                        CHECK (result IN ('success','duplicate','error','unauthorized')),
  error_message         TEXT,
  metadata              JSONB       DEFAULT '{}'::jsonb,
  device_info           JSONB       DEFAULT '{}'::jsonb,
  -- e.g., {"user_agent": "...", "ip": "...", "timestamp": "..."}
  timestamp             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_entitlement_issues_event ON it_run_entitlement_issues(event_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_issues_participant ON it_run_entitlement_issues(participant_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_issues_staff ON it_run_entitlement_issues(staff_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_issues_timestamp ON it_run_entitlement_issues(timestamp);

-- ── Staff Activity Log (Race-Day Operations Audit) ──────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_staff_activity_log (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  staff_id              UUID        NOT NULL REFERENCES it_run_staff(id) ON DELETE CASCADE,
  participant_id        UUID        REFERENCES it_run_participants(id) ON DELETE SET NULL,
  action                TEXT        NOT NULL,
  -- e.g., 'bib_collected', 'checked_in', 'breakfast_issued', 'manual_override', 'login', 'logout'
  status                TEXT        NOT NULL DEFAULT 'success'
                        CHECK (status IN ('success','error','unauthorized','rate_limited')),
  details               JSONB       DEFAULT '{}'::jsonb,
  ip_address            TEXT,
  user_agent            TEXT,
  timestamp             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_event ON it_run_staff_activity_log(event_id);
CREATE INDEX IF NOT EXISTS idx_staff_activity_staff ON it_run_staff_activity_log(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_activity_timestamp ON it_run_staff_activity_log(timestamp);

-- ── RLS Policies ───────────────────────────────────────────────────────────────

ALTER TABLE it_run_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_event_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_entitlement_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_run_staff_activity_log ENABLE ROW LEVEL SECURITY;

-- Staff can view their own record
CREATE POLICY staff_view_self ON it_run_staff
  FOR SELECT USING (auth.uid()::text = id::text);

-- No anon/authenticated access by default; service role bypasses RLS
CREATE POLICY no_access_staff ON it_run_staff
  FOR ALL USING (false);

CREATE POLICY no_access_roles ON it_run_staff_roles
  FOR ALL USING (false);

CREATE POLICY no_access_entitlements ON it_run_event_entitlements
  FOR ALL USING (false);

CREATE POLICY no_access_issues ON it_run_entitlement_issues
  FOR ALL USING (false);

CREATE POLICY no_access_activity ON it_run_staff_activity_log
  FOR ALL USING (false);

-- ── Migration log ──────────────────────────────────────────────────────────────

COMMENT ON TABLE it_run_staff IS 'Event operational staff: BIB collectors, check-in, breakfast, etc.';
COMMENT ON TABLE it_run_event_entitlements IS 'Unified model for all race-day entitlements: BIB, breakfast, goodies, t-shirt, medal, certificate';
COMMENT ON TABLE it_run_entitlement_issues IS 'Immutable audit log: every issuance/collection action';
COMMENT ON TABLE it_run_staff_activity_log IS 'Detailed race-day operations audit: logins, scans, actions, errors';
