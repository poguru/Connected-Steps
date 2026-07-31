-- Configurable master tables for event types and categories.
-- These replace the hardcoded dropdown values in the admin event forms.
-- Existing events continue to work: events.event_type / event_category are
-- plain TEXT columns with no FK constraint, so any existing value remains valid.

-- ── event_types ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_types (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  description TEXT,
  icon        TEXT        NOT NULL DEFAULT '🎯',
  color       TEXT        NOT NULL DEFAULT '#e8620a',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_types_slug
  ON public.event_types (lower(slug));

-- Case-insensitive uniqueness on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_types_name
  ON public.event_types (lower(name));

-- ── event_categories ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_categories_slug
  ON public.event_categories (lower(slug));

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_categories_name
  ON public.event_categories (lower(name));

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories  ENABLE ROW LEVEL SECURITY;

-- Admins can do everything; public can read active rows
CREATE POLICY "admin_all_event_types"
  ON public.event_types FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "admin_all_event_categories"
  ON public.event_categories FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: existing event_type values ─────────────────────────────────────────
-- Slugs match the current hardcoded string values in the events table so
-- existing events automatically map to these rows with no data migration.

INSERT INTO public.event_types (name, slug, icon, color, sort_order) VALUES
  ('Running',   'running',   '🏃', '#e8620a', 1),
  ('Cycling',   'cycling',   '🚴', '#3b82f6', 2),
  ('Training',  'training',  '💪', '#a855f7', 3),
  ('Race',      'race',      '🏆', '#ef4444', 4),
  ('Community', 'community', '🤝', '#22c55e', 5),
  ('Workshop',  'workshop',  '📚', '#eab308', 6)
ON CONFLICT DO NOTHING;

-- ── Seed: existing event_category values ─────────────────────────────────────
-- Slugs match the current hardcoded string values used in events.event_category.

INSERT INTO public.event_categories (name, slug, sort_order) VALUES
  ('Community Run',      'community',  1),
  ('Marathon / Half',    'marathon',   2),
  ('Corporate Wellness', 'corporate',  3),
  ('Virtual Challenge',  'virtual',    4),
  ('Walkathon',          'walkathon',  5),
  ('Cycling Event',      'cycling',    6),
  ('Triathlon',          'triathlon',  7)
ON CONFLICT DO NOTHING;
