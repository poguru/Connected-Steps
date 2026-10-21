-- ============================================================
-- Migration 20261026000001 — Admin manual registration (IT Run)
--
-- Adds the columns that record an admin-created registration: where it came from, who created it, whether a payment
-- was waived and who approved the waiver, and an idempotency key so a retried request creates one registration.
-- Public registrations keep the default source 'public' and their existing columns, so nothing changes for them.
--
-- Not yet applied: needs review and explicit approval before it is run in any environment.
-- ============================================================

ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS registration_source TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS created_by_admin    TEXT,
  ADD COLUMN IF NOT EXISTS waiver_reason       TEXT,
  ADD COLUMN IF NOT EXISTS waiver_approved_by  TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key     TEXT;

ALTER TABLE public.it_run_registrations
  DROP CONSTRAINT IF EXISTS it_run_registrations_source_check;
ALTER TABLE public.it_run_registrations
  ADD CONSTRAINT it_run_registrations_source_check
  CHECK (registration_source IN ('public', 'admin_manual'));

-- One registration per admin submission key. Partial, so public registrations (no key) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS it_run_registrations_idempotency_key_uidx
  ON public.it_run_registrations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS it_run_registrations_source_idx
  ON public.it_run_registrations (event_id, registration_source);
