-- ============================================================
-- Connected Steps — Separate registrant from participant in event_registrations
-- File: 20260812000001_event_registrations_registrant_email.sql
--
-- Problem:
--   event_registrations.user_email is overloaded:
--     • Single-participant path: user_email = the participant's own email
--     • Multi-participant path:  user_email = the CS account that made the booking
--
--   This causes "already registered" errors when a registered user tries
--   to register additional people (friends/family) via the multi-participant path,
--   because the UNIQUE(event_id, user_email) constraint sees the account owner's
--   email already in the table.
--
-- Fix:
--   Add registrant_email — the CS account that created the booking.
--   user_email now always represents the lead participant's contact email.
--   The UNIQUE(event_id, user_email) constraint continues to prevent the same
--   participant from registering twice, while different participants can be
--   booked by the same account without conflict.
--
-- Backward compatibility:
--   • All existing rows are single-participant self-registrations where
--     registrant = participant, so registrant_email = user_email for all existing rows.
--   • No existing data is modified or deleted.
--   • All foreign keys, RLS policies, and existing indexes are preserved.
-- ============================================================

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS registrant_email TEXT;

-- Backfill: for all existing registrations the registrant IS the participant.
UPDATE public.event_registrations
  SET registrant_email = user_email
  WHERE registrant_email IS NULL;

-- Index: efficiently find "all bookings created by this CS account" across events.
CREATE INDEX IF NOT EXISTS idx_event_reg_registrant_email
  ON public.event_registrations (registrant_email, event_id)
  WHERE registrant_email IS NOT NULL;
