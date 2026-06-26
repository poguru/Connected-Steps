-- ============================================================
-- Connected Steps — Enterprise Event Management Phase 1
-- File: 20260626000009_enterprise_events_phase1.sql
--
-- Safe additive changes only:
--   • ADD COLUMN IF NOT EXISTS (never drops or renames)
--   • New table event_races (independent, no FK breaks)
--   • All existing events, registrations, triggers unchanged
--
-- The distance_categories TEXT[] column is preserved for backward
-- compatibility with all existing code and mobile app queries.
-- New code uses event_races for richer race configuration.
-- ============================================================


-- ── Expand events table ───────────────────────────────────────────────────────

-- Event category for filtering/grouping
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_category TEXT NOT NULL DEFAULT 'community';
-- community | marathon | corporate | virtual | walkathon | cycling | triathlon

-- Organizer contact details (organizer text column already exists — these are extras)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organizer_email    TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organizer_phone    TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS support_email      TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS support_phone      TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS emergency_contact  TEXT;

-- Location enrichment
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meeting_point      TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS training_area      TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lat                DECIMAL(10, 8);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lng                DECIMAL(11, 8);

-- Rich content
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS banner_image       TEXT;   -- separate from cover_image
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS highlights         JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS faqs               JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS social_links       JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS website            TEXT;

-- Registration configuration
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS registration_limit    INTEGER;  -- alias to max_participants, wizard-level
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS waiting_list_enabled  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS early_bird_ends_at    TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS require_login         BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS approval_required     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS referral_enabled      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS coupon_enabled        BOOLEAN NOT NULL DEFAULT true;

-- Policies
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS refund_policy         TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancellation_policy   TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS transfer_policy       TEXT;

-- Visibility & wizard state
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibility            TEXT NOT NULL DEFAULT 'public';
-- public | private | unlisted
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS wizard_step           SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS wizard_complete       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS published_at          TIMESTAMPTZ;


-- ── event_races table ─────────────────────────────────────────────────────────
-- Replaces the flat distance_categories TEXT[] with a rich, per-race entity.
-- Existing events retain their distance_categories array; new events use this
-- table for full race configuration.

CREATE TABLE IF NOT EXISTS public.event_races (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Basic info
  name             TEXT         NOT NULL,
  distance         TEXT         NOT NULL,   -- "5K", "10K", "21.1K", etc.
  description      TEXT,

  -- Pricing
  price            INTEGER      NOT NULL DEFAULT 0,  -- in rupees (same as events.price)
  early_bird_price INTEGER,                          -- optional early-bird rate

  -- Capacity
  max_slots        INTEGER,                          -- null = unlimited
  slot_reserved    INTEGER      NOT NULL DEFAULT 0,  -- maintained by triggers / application

  -- Timing
  reporting_time   TEXT,   -- "05:30"
  gun_time         TEXT,   -- "06:00"
  cutoff_time      TEXT,   -- "08:00" (optional cutoff for results)

  -- Race configuration
  timing_chip      BOOLEAN NOT NULL DEFAULT false,
  auto_bib         BOOLEAN NOT NULL DEFAULT false,
  bib_prefix       TEXT,                            -- e.g. "5K-" for bib numbering

  -- Restrictions
  gender_restriction TEXT,   -- null = all | 'male' | 'female'
  min_age          INTEGER,
  max_age          INTEGER,

  -- Qualification
  qualifying_required BOOLEAN NOT NULL DEFAULT false,
  qualifying_notes    TEXT,

  -- Display
  display_order    SMALLINT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',   -- active | inactive | full
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS event_races_event_id_idx ON public.event_races (event_id, display_order);
CREATE INDEX IF NOT EXISTS event_races_status_idx   ON public.event_races (status) WHERE status = 'active';

-- RLS
ALTER TABLE public.event_races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_races
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read for published event races
CREATE POLICY "anon_read_published" ON public.event_races
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_races.event_id AND status = 'published'
    )
  );


-- ── event_wizard_drafts table ─────────────────────────────────────────────────
-- Stores auto-save wizard state so admins can resume event creation.
-- Separate from events to avoid polluting the events table with partial data.

CREATE TABLE IF NOT EXISTS public.event_wizard_drafts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  admin_email TEXT        NOT NULL,
  step        SMALLINT    NOT NULL DEFAULT 1,
  draft_data  JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_wizard_drafts_admin_idx
  ON public.event_wizard_drafts (admin_email, updated_at DESC);

ALTER TABLE public.event_wizard_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_wizard_drafts
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── Backfill event_category for existing events ───────────────────────────────
UPDATE public.events SET event_category = CASE
  WHEN lower(event_type) IN ('cycling') THEN 'cycling'
  WHEN lower(event_type) IN ('training', 'workshop') THEN 'corporate'
  WHEN lower(event_type) IN ('race') THEN 'marathon'
  ELSE 'community'
END
WHERE event_category = 'community';
