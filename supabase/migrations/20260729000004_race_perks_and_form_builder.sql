-- Phase: Race perks, pricing model, multi-participant per category, form field scoping
--
-- event_races gains:
--   perks           JSONB  — what's included (medal, bib, tshirt, breakfast, certificate, goodies)
--   price_type      TEXT   — 'per_participant' | 'per_registration'
--   min_participants INT   — minimum participants per registration (default 1)
--   max_participants INT   — maximum participants per registration (default 1, >1 = group/team)
--
-- event_form_fields gains:
--   race_ids TEXT[]        — empty = shown for ALL categories; non-empty = only those race IDs

ALTER TABLE public.event_races
  ADD COLUMN IF NOT EXISTS perks            JSONB    NOT NULL DEFAULT '{"medal":false,"bib":true,"tshirt":false,"breakfast":false,"certificate":false,"goodies":false}',
  ADD COLUMN IF NOT EXISTS price_type       TEXT     NOT NULL DEFAULT 'per_participant',
  ADD COLUMN IF NOT EXISTS min_participants INTEGER  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_participants INTEGER  NOT NULL DEFAULT 1;

ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS race_ids TEXT[] NOT NULL DEFAULT '{}';

-- Constraint: price_type must be a valid value
ALTER TABLE public.event_races
  DROP CONSTRAINT IF EXISTS event_races_price_type_check;
ALTER TABLE public.event_races
  ADD CONSTRAINT event_races_price_type_check
  CHECK (price_type IN ('per_participant', 'per_registration'));

-- Constraint: participants range is valid
ALTER TABLE public.event_races
  DROP CONSTRAINT IF EXISTS event_races_participants_range_check;
ALTER TABLE public.event_races
  ADD CONSTRAINT event_races_participants_range_check
  CHECK (min_participants >= 1 AND max_participants >= min_participants);

-- Index for category-scoped field lookups
CREATE INDEX IF NOT EXISTS idx_form_fields_race_ids ON public.event_form_fields USING GIN (race_ids);
