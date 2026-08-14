-- Add registration source so email logic and reporting can distinguish
-- admin-created entries from online (self-service) registrations.
--
-- source = 'online'  — registered through the public event registration page
-- source = 'admin'   — created manually via the Admin Dashboard
--
-- Default 'online' keeps all existing rows correct without a backfill.

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'
    CHECK (source IN ('online', 'admin'));
