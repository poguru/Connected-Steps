-- ============================================================
-- Migration 20261023000001 — IT Run Sprint-2 BIB numbering
--
-- 1. team_key: the two members of a duo or parent-and-child team share one key, so BIB numbers pair
--    them exactly. Older bookings keep NULL and are paired by role at allocation.
-- 2. bib_email_sent_at: the claim for the BIB email (numbers, QR codes and the collection slot link).
--    It is separate from bib_invite_sent_at, which marks the earlier slot-link email.
-- 3. A unique BIB per event, so two allocations can never issue the same number.
--
-- Run this in the Supabase SQL editor before the code that uses it is deployed.
-- ============================================================

ALTER TABLE public.it_run_participants
  ADD COLUMN IF NOT EXISTS team_key UUID;

CREATE INDEX IF NOT EXISTS idx_itr_part_team_key
  ON public.it_run_participants (team_key)
  WHERE team_key IS NOT NULL;

ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS bib_email_sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_itr_part_event_bib_unique
  ON public.it_run_participants (event_id, bib_number)
  WHERE bib_number IS NOT NULL;
