-- Phase 6: Volunteer management enhancements
-- Adds shift scheduling, notes, and phone-number fields to the volunteer tables.
-- No new tables → existing service_role_all RLS policies on these tables cover the new columns.

-- Shift times and admin notes are assignment-scoped (per volunteer per event)
ALTER TABLE public.event_portal_assignments
  ADD COLUMN IF NOT EXISTS notes       TEXT,
  ADD COLUMN IF NOT EXISTS shift_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shift_end   TIMESTAMPTZ;

-- Phone number is user-scoped (same across events for the same portal user)
ALTER TABLE public.event_portal_users
  ADD COLUMN IF NOT EXISTS phone TEXT;
