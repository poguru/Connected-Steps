-- ============================================================
-- Migration 20260925000010 — Confirmation email idempotency
--
-- Adds confirmation_email_sent_at to it_run_registrations.
-- sendItRunConfirmationEmail does an atomic UPDATE ... IS NULL
-- on this column before sending — only the winner (NULL → timestamp)
-- sends the email; all subsequent callers see a non-NULL value and skip.
-- This prevents duplicate emails from: payment retry, webhook retry,
-- page refresh, concurrent verify + webhook, and application restarts.
-- ============================================================

ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;
