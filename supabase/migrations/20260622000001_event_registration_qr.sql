-- Event registration QR: add qr_token and check-in tracking
-- Safe to re-run: all statements use IF NOT EXISTS guards.

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS qr_token     TEXT,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Unique index on qr_token (non-null only) for fast O(1) check-in lookups
CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_qr_token_idx
  ON public.event_registrations (qr_token)
  WHERE qr_token IS NOT NULL;

-- Index for admin check-in queries filtering by checked_in_at
CREATE INDEX IF NOT EXISTS event_registrations_checkin_idx
  ON public.event_registrations (event_id, checked_in_at)
  WHERE checked_in_at IS NOT NULL;
