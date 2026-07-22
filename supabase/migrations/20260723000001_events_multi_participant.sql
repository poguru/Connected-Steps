-- ============================================================
-- Connected Steps — Multi-Participant Registration Support
-- File: 20260723000001_events_multi_participant.sql
--
-- Adds two columns to events:
--   allow_multi_participant  — enables the multi-person form
--   max_per_registration     — cap on how many per booking (0 = unlimited)
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS allow_multi_participant BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_per_registration   INT     NOT NULL DEFAULT 1;
