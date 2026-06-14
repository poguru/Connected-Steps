-- Add registration_close_time to events table.
-- Admins set this to the time (IST) after which registration is no longer accepted.
-- Interpreted as: registration closes at this time on the event's start_date.
-- No new RLS policy needed — existing events_anon_select_published covers all columns.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registration_close_time TIME;
