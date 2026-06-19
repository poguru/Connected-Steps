-- Add registration_closes_at: proper TIMESTAMPTZ for IST-aware registration deadline
-- Replaces registration_close_time (TIME only, assumed to be on start_date) which was ambiguous.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ;

-- Backfill: events that already had a registration_close_time get the deadline set to
-- that time on their start_date, interpreted as Asia/Kolkata (IST = UTC+05:30).
UPDATE public.events
SET registration_closes_at = (
  (start_date::text || 'T' || registration_close_time::text || '+05:30')::timestamptz
)
WHERE registration_close_time IS NOT NULL
  AND registration_closes_at IS NULL
  AND start_date IS NOT NULL;
