-- ============================================================
-- Migration 20261024000001 — IT Run identity-verification outcome
--
-- 1. verification_outcome: which fact was verified, stored explicitly. Government and company are never
--    inferred from a filename or from a value the browser sent.
-- 2. verification_version: incremented on every change, so a review made on an out-of-date record is refused
--    instead of silently overwriting a newer decision.
--
-- Existing verified rows are backfilled from their document type. Children (verified with no document) keep NULL.
-- Registration and payment status are not changed by this migration.
-- ============================================================

ALTER TABLE public.it_run_participants
  ADD COLUMN IF NOT EXISTS verification_outcome TEXT,
  ADD COLUMN IF NOT EXISTS verification_version INT NOT NULL DEFAULT 0;

ALTER TABLE public.it_run_participants
  DROP CONSTRAINT IF EXISTS it_run_participants_verification_outcome_check;

ALTER TABLE public.it_run_participants
  ADD CONSTRAINT it_run_participants_verification_outcome_check
  CHECK (verification_outcome IS NULL OR verification_outcome IN ('government_verified', 'company_verified'));

UPDATE public.it_run_participants
SET verification_outcome = CASE id_document_type
      WHEN 'company'    THEN 'company_verified'
      WHEN 'government' THEN 'government_verified'
    END
WHERE verification_status = 'verified'
  AND id_document_type IS NOT NULL
  AND verification_outcome IS NULL;
