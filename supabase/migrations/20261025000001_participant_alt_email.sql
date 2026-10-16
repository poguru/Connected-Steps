-- ============================================================
-- Migration 20261025000001 — IT Run optional alternative email (per participant)
--
-- Adds a nullable alternative address to each participant. Existing rows stay NULL, so every current registration
-- behaves as before. Messages go to the primary address and, when present, to this one as well.
-- ============================================================

ALTER TABLE public.it_run_participants
  ADD COLUMN IF NOT EXISTS alt_email TEXT;
