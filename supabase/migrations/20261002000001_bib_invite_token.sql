-- Migration: 20261002000001_bib_invite_token.sql
--
-- Adds a secure random token to it_run_registrations that gates the public
-- BIB collection booking page at /events/it-run-sprint-2/bib-collection/<token>.
-- Token is set once on first confirmed payment and never rotated.
-- bib_invite_sent_at mirrors the confirmation_email_sent_at idempotency pattern.

ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS bib_invite_token   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS bib_invite_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_itr_reg_bib_token
  ON public.it_run_registrations (bib_invite_token)
  WHERE bib_invite_token IS NOT NULL;
