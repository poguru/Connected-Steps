-- ============================================================
-- Connected Steps — Generic Event Management Platform
-- File: 20260722000005_generic_event_platform.sql
--
-- Creates:
--   • event_participants    — one row per person per event (supports multi-participant registrations)
--   • event_service_configs — enable/disable/configure modules per event
--   • event_portal_users    — volunteer/operator accounts (cross-event)
--   • event_portal_assignments — link portal users to specific events + roles
--   • event_portal_sessions — auth sessions for the ops portal
--   • event_service_logs    — full audit trail for every service action
--
-- Backward compat:
--   • Adds participant_count to event_registrations (DEFAULT 1)
--   • Creates one event_participant row per existing event_registration
--     so old QR codes continue to work with the new scan endpoint
-- ============================================================


-- ── 1. event_participants ─────────────────────────────────────────────────────
-- Primary unit for the ops portal. One row per physical person attending.
-- For legacy single-registrant events, exactly one row exists per registration.

CREATE TABLE IF NOT EXISTS public.event_participants (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  registration_id          UUID        NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  account_email            TEXT        NOT NULL,  -- CS account that owns this booking

  -- Person info
  first_name               TEXT        NOT NULL,
  last_name                TEXT,
  gender                   TEXT,
  dob                      DATE,
  blood_group              TEXT,
  mobile                   TEXT,
  email                    TEXT,                   -- participant's own contact (may differ from account)

  -- Race / category
  distance_category        TEXT,
  tshirt_size              TEXT,
  bib_number               TEXT,
  wave                     TEXT,

  -- Per-participant QR (signed with signEventQR(participantId, eventId))
  qr_token                 TEXT        UNIQUE,

  -- ── Service status columns ────────────────────────────────────────────────
  checked_in_at            TIMESTAMPTZ,
  checked_in_by            TEXT,

  tshirt_issued            BOOLEAN     NOT NULL DEFAULT false,
  tshirt_issued_at         TIMESTAMPTZ,
  tshirt_issued_by         TEXT,

  breakfast_availed        BOOLEAN     NOT NULL DEFAULT false,
  breakfast_availed_at     TIMESTAMPTZ,
  breakfast_availed_by     TEXT,

  medal_issued             BOOLEAN     NOT NULL DEFAULT false,
  medal_issued_at          TIMESTAMPTZ,
  medal_issued_by          TEXT,

  bib_collected_at         TIMESTAMPTZ,
  bib_collected_by         TEXT,

  certificate_url          TEXT,
  certificate_generated_at TIMESTAMPTZ,

  status                   TEXT        NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique BIB per event
CREATE UNIQUE INDEX IF NOT EXISTS event_participants_bib_idx
  ON public.event_participants (event_id, bib_number) WHERE bib_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_participants_event_idx
  ON public.event_participants (event_id, status);

CREATE INDEX IF NOT EXISTS event_participants_account_idx
  ON public.event_participants (account_email, event_id);

CREATE INDEX IF NOT EXISTS event_participants_checkin_idx
  ON public.event_participants (event_id, checked_in_at) WHERE checked_in_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_participants_registration_idx
  ON public.event_participants (registration_id);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_participants
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. event_service_configs ──────────────────────────────────────────────────
-- Per-event toggle + config for each service module.
-- Supported service_name values:
--   checkin | tshirt | breakfast | bib | medal | certificate | medical | photography

CREATE TABLE IF NOT EXISTS public.event_service_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  service_name  TEXT        NOT NULL,
  enabled       BOOLEAN     NOT NULL DEFAULT true,
  config        JSONB       NOT NULL DEFAULT '{}',
  display_order SMALLINT    NOT NULL DEFAULT 0,
  UNIQUE(event_id, service_name)
);

CREATE INDEX IF NOT EXISTS event_service_configs_event_idx
  ON public.event_service_configs (event_id, display_order);

ALTER TABLE public.event_service_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_service_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. event_portal_users ─────────────────────────────────────────────────────
-- Volunteer / operator accounts. Separate from the main CS user accounts.
-- A single portal user can be assigned to multiple events with different roles.

CREATE TABLE IF NOT EXISTS public.event_portal_users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.event_portal_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_portal_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 4. event_portal_assignments ───────────────────────────────────────────────
-- Links a portal user to a specific event with a specific role.
-- Valid roles: event_admin | registration_desk | checkin | tshirt |
--              breakfast | bib | medal | certificate | support | medical | photography

CREATE TABLE IF NOT EXISTS public.event_portal_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID        NOT NULL REFERENCES public.event_portal_users(id) ON DELETE CASCADE,
  event_id       UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  role           TEXT        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(portal_user_id, event_id, role)
);

CREATE INDEX IF NOT EXISTS event_portal_assignments_event_idx
  ON public.event_portal_assignments (event_id, role) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS event_portal_assignments_user_idx
  ON public.event_portal_assignments (portal_user_id) WHERE is_active = true;

ALTER TABLE public.event_portal_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_portal_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 5. event_portal_sessions ──────────────────────────────────────────────────
-- Server-side session store for the ops portal (cookie value is a signed JWT-like
-- token; token_hash here is SHA-256 of that value for server-side revocation).

CREATE TABLE IF NOT EXISTS public.event_portal_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID        NOT NULL REFERENCES public.event_portal_users(id) ON DELETE CASCADE,
  event_id       UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  token_hash     TEXT        NOT NULL UNIQUE,
  role           TEXT        NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_portal_sessions_user_idx
  ON public.event_portal_sessions (portal_user_id, expires_at);

ALTER TABLE public.event_portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_portal_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 6. event_service_logs ─────────────────────────────────────────────────────
-- Full audit log for every service action performed by any volunteer.

CREATE TABLE IF NOT EXISTS public.event_service_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  participant_id  UUID        REFERENCES public.event_participants(id) ON DELETE SET NULL,
  registration_id UUID        REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  service_name    TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  volunteer_email TEXT,
  volunteer_role  TEXT,
  notes           TEXT,
  device_info     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_service_logs_event_idx
  ON public.event_service_logs (event_id, service_name, created_at DESC);

CREATE INDEX IF NOT EXISTS event_service_logs_participant_idx
  ON public.event_service_logs (participant_id) WHERE participant_id IS NOT NULL;

ALTER TABLE public.event_service_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_service_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 7. Extend event_registrations ─────────────────────────────────────────────

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS participant_count INT NOT NULL DEFAULT 1;


-- ── 8. Backward compat data migration ────────────────────────────────────────
-- Create one event_participant row for every existing event_registration.
-- Copies all service-status columns so old QR codes still scan correctly.
-- Uses ON CONFLICT DO NOTHING so this is safe to re-run.

INSERT INTO public.event_participants (
  event_id,
  registration_id,
  account_email,
  first_name,
  gender,
  dob,
  blood_group,
  mobile,
  email,
  distance_category,
  tshirt_size,
  bib_number,
  qr_token,
  checked_in_at,
  checked_in_by,
  tshirt_issued,
  tshirt_issued_at,
  tshirt_issued_by,
  breakfast_availed,
  breakfast_availed_at,
  breakfast_availed_by,
  certificate_url,
  certificate_generated_at,
  status,
  created_at
)
SELECT
  er.event_id,
  er.id,
  er.user_email,
  er.user_name,
  er.gender,
  er.dob,
  er.blood_group,
  er.phone,
  er.user_email,
  er.distance_category,
  er.tshirt_size,
  er.bib_number,
  er.qr_token,
  er.checked_in_at,
  er.checked_in_by,
  COALESCE(er.tshirt_issued, false),
  er.tshirt_issued_at,
  er.tshirt_issued_by,
  COALESCE(er.breakfast_availed, false),
  er.breakfast_availed_at,
  er.breakfast_verified_by,
  er.certificate_url,
  er.certificate_generated_at,
  CASE
    WHEN er.status = 'cancelled' THEN 'cancelled'
    ELSE 'active'
  END,
  er.created_at
FROM public.event_registrations er
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_participants ep WHERE ep.registration_id = er.id
)
ON CONFLICT DO NOTHING;
