-- ============================================================
-- Connected Steps — Training Location Management System
-- File: 20260626000002_training_locations.sql
-- Backward compatible: no existing tables modified.
-- ============================================================

-- ── Master training locations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_locations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,              -- "Kondapur"
  area          TEXT,                              -- "Kondapur, Miyapur"
  city          TEXT        NOT NULL DEFAULT 'Hyderabad',
  state         TEXT        NOT NULL DEFAULT 'Telangana',
  meeting_point TEXT,                              -- "Botanical Garden Gate-1"
  maps_url      TEXT,                              -- Google Maps link
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  max_capacity  INTEGER,
  status        TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive')),
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS training_locations_status_idx
  ON public.training_locations (status)
  WHERE status = 'active';

-- ── User-to-location assignments (many-to-many) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_location_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT        NOT NULL REFERENCES public.users(email)              ON DELETE CASCADE,
  location_id UUID        NOT NULL REFERENCES public.training_locations(id)    ON DELETE CASCADE,
  is_primary  BOOLEAN     NOT NULL DEFAULT true,   -- primary = "home" location for leaderboard
  assigned_by TEXT,                                -- admin email who assigned
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_email, location_id)
);

CREATE INDEX IF NOT EXISTS ula_user_email_idx    ON public.user_location_assignments (user_email);
CREATE INDEX IF NOT EXISTS ula_location_idx      ON public.user_location_assignments (location_id);
CREATE INDEX IF NOT EXISTS ula_primary_idx       ON public.user_location_assignments (user_email) WHERE is_primary = true;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.training_locations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_location_assignments ENABLE ROW LEVEL SECURITY;
-- All access through service role (API layer) — no direct client access

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_tl_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_tl_updated_at ON public.training_locations;
CREATE TRIGGER trg_tl_updated_at
  BEFORE UPDATE ON public.training_locations
  FOR EACH ROW EXECUTE FUNCTION set_tl_updated_at();

-- ── Seed default Hyderabad training locations ─────────────────────────────────
INSERT INTO public.training_locations (name, area, city, meeting_point, display_order) VALUES
  ('Kondapur',      'Kondapur',             'Hyderabad', 'Botanical Garden Gate-1',        1),
  ('Miyapur',       'Miyapur',              'Hyderabad', 'Miyapur Cheruvu Lake Entrance',  2),
  ('Gachibowli',    'Gachibowli',           'Hyderabad', 'HBC Gachibowli',                 3),
  ('Kukatpally',    'Kukatpally',           'Hyderabad', 'KPHB Colony Ground',             4),
  ('Kokapet',       'Kokapet',              'Hyderabad', 'Kokapet Lake',                   5),
  ('Madhapur',      'Madhapur / HITEC City','Hyderabad', 'Durgam Cheruvu Trail',           6)
ON CONFLICT DO NOTHING;
