-- Add admin-editable content fields to it_run_events.
-- All fields are nullable with no defaults so existing rows are unaffected.
-- Text fields are sanitized by the API layer before insert (no raw HTML stored).

ALTER TABLE public.it_run_events
  ADD COLUMN IF NOT EXISTS description           TEXT,
  ADD COLUMN IF NOT EXISTS hero_content          TEXT,
  ADD COLUMN IF NOT EXISTS event_highlights      JSONB,
  ADD COLUMN IF NOT EXISTS important_instructions TEXT,
  ADD COLUMN IF NOT EXISTS contact_email         TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone         TEXT,
  ADD COLUMN IF NOT EXISTS terms_text            TEXT,
  ADD COLUMN IF NOT EXISTS privacy_text          TEXT,
  ADD COLUMN IF NOT EXISTS bib_collection_info   TEXT,
  ADD COLUMN IF NOT EXISTS race_day_info         TEXT;
