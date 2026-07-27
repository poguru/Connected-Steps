-- Phase 5: Pricing Engine + Category Change
-- Adds race-level pricing columns to event_registrations so early-bird pricing
-- and category changes are tracked accurately.
--
-- No new tables → no new RLS policies needed.
-- All changes are additive (IF NOT EXISTS / DEFAULT).

-- ── 1. Link each registration to the race it was booked into ──────────────────
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS race_id UUID REFERENCES public.event_races(id) ON DELETE SET NULL;

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS is_early_bird BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Category-change tracking ───────────────────────────────────────────────
-- price_differential: cumulative delta since original booking
--   +ve  → participant owes more (upgraded to a more expensive category)
--   -ve  → refund is due (downgraded to a cheaper category)
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS price_differential INTEGER NOT NULL DEFAULT 0;

-- JSON array of {from, to, from_price, to_price, differential, changed_at, changed_by}
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS category_change_log JSONB NOT NULL DEFAULT '[]';

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS category_changed_at TIMESTAMPTZ;

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS category_changed_by TEXT;

-- ── 3. Index for race lookups ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS event_registrations_race_id_idx
  ON public.event_registrations (race_id) WHERE race_id IS NOT NULL;

COMMENT ON COLUMN public.event_registrations.race_id           IS 'Race the participant is registered into (NULL for legacy events without event_races rows).';
COMMENT ON COLUMN public.event_registrations.is_early_bird     IS 'True if early_bird_price was applied at registration time.';
COMMENT ON COLUMN public.event_registrations.price_differential IS 'Cumulative price adjustment due to category changes. +ve = owes more, -ve = refund due.';
COMMENT ON COLUMN public.event_registrations.category_change_log IS 'Audit trail of every admin-initiated category change.';
