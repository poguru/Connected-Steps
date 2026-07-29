-- Per-category waitlist support.
-- Allows a user to be on the waitlist for multiple race categories
-- within the same event (one entry per person per category).
--
-- Changes:
--   1. Replaces the single (event_id, user_email) unique index with two
--      partial indices: one for category-scoped entries, one for event-wide.
--   2. Updates the position trigger to compute position within the same category.
--   3. Adds a count_confirmed_for_race() helper used by the API capacity check.

-- ── 1. Replace unique index ───────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_event_waitlist_unique;

-- One entry per (event, email) for event-wide (no category) waitlist rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_waitlist_no_cat
  ON public.event_waitlist (event_id, user_email)
  WHERE status = 'waiting' AND distance_category IS NULL;

-- One entry per (event, email, category) for category-specific waitlist rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_waitlist_with_cat
  ON public.event_waitlist (event_id, user_email, distance_category)
  WHERE status = 'waiting' AND distance_category IS NOT NULL;

-- ── 2. Update position trigger ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Position is scoped per (event_id, distance_category).
  -- IS NOT DISTINCT FROM handles NULL = NULL correctly.
  SELECT COALESCE(MAX(position), 0) + 1
    INTO NEW.position
    FROM public.event_waitlist
   WHERE event_id           = NEW.event_id
     AND distance_category IS NOT DISTINCT FROM NEW.distance_category
     AND status             = 'waiting';
  RETURN NEW;
END;
$$;

-- ── 3. Helper: count confirmed registrations for a specific race category ──────

CREATE OR REPLACE FUNCTION public.count_confirmed_for_race(
  p_event_id         UUID,
  p_distance_category TEXT
)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.event_registrations
   WHERE event_id          = p_event_id
     AND distance_category = p_distance_category
     AND status           != 'cancelled'
     AND payment_status   IN ('paid', 'free');
$$;

NOTIFY pgrst, 'reload schema';
