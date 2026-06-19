-- Add distance_categories to events (array of short codes)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS distance_categories TEXT[] DEFAULT '{}';

-- Add distance_category to event_registrations (the one the user chose)
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS distance_category TEXT;

-- Backfill distance_categories for existing events based on common title patterns
UPDATE public.events
SET distance_categories = CASE
  WHEN title ILIKE '%full marathon%' OR title ILIKE '%42%'  THEN ARRAY['FM']
  WHEN title ILIKE '%half marathon%' OR title ILIKE '%21%'  THEN ARRAY['HM']
  WHEN title ILIKE '%ultra%'                                THEN ARRAY['Ultra']
  WHEN title ILIKE '%10k%' OR title ILIKE '%10 k%'         THEN ARRAY['10K']
  WHEN title ILIKE '%5k%'  OR title ILIKE '%5 k%'          THEN ARRAY['5K']
  WHEN title ILIKE '%3k%'  OR title ILIKE '%3 k%'          THEN ARRAY['3K']
  WHEN title ILIKE '%15k%' OR title ILIKE '%15 k%'         THEN ARRAY['15K']
  WHEN title ILIKE '%cycling%' OR event_type = 'cycling'   THEN ARRAY['Cycling']
  WHEN title ILIKE '%walk%'                                 THEN ARRAY['Walking']
  WHEN title ILIKE '%trail%'                                THEN ARRAY['Trail Run']
  ELSE '{}'
END
WHERE distance_categories = '{}' OR distance_categories IS NULL;
