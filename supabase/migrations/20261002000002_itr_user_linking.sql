-- ============================================================
-- Migration 20261002000002 — Link IT Run registrations to CS accounts
--
-- Adds linked_user_email to it_run_registrations so that after a participant
-- verifies their email (OTP gate), the registration can be associated with
-- their Connected Steps account for "My Registrations" lookups.
--
-- Nullable: existing registrations remain valid and unaffected.
-- FK to public.users(email): the canonical CS user identity field.
-- Index on linked_user_email for fast per-user listing queries.
-- ============================================================

ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS linked_user_email TEXT
    REFERENCES public.users(email)
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_itr_registrations_linked_user
  ON public.it_run_registrations(linked_user_email)
  WHERE linked_user_email IS NOT NULL;
