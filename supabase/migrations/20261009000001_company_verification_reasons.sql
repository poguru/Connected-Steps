-- Migration: 20261009000001_company_verification_reasons.sql
--
-- Adds structured rejection reasons to company ID verification workflow.
-- Replaces internal codes like "INVALID ID" with user-facing explanations.
--
-- New column: verification_reason
-- Stores one of: unreadable_id, missing_employee_id, details_mismatch, invalid_document,
--                physical_verification_required, clarification_needed, custom
--
-- New column: admin_explanation
-- Optional free-text explanation provided by reviewer (1000 char limit)

ALTER TABLE public.it_run_company_verifications
  ADD COLUMN IF NOT EXISTS verification_reason TEXT,
  ADD COLUMN IF NOT EXISTS admin_explanation TEXT;

-- Add constraint to validate reason codes
ALTER TABLE public.it_run_company_verifications
  DROP CONSTRAINT IF EXISTS it_run_company_verifications_reason_check,
  ADD CONSTRAINT it_run_company_verifications_reason_check
    CHECK (verification_reason IN (
      'unreadable_id',
      'missing_employee_id',
      'details_mismatch',
      'invalid_document',
      'physical_verification_required',
      'clarification_needed',
      'custom',
      NULL
    ));

-- Ensure admin_explanation doesn't exceed 1000 characters
ALTER TABLE public.it_run_company_verifications
  ADD CONSTRAINT admin_explanation_length
    CHECK (admin_explanation IS NULL OR char_length(admin_explanation) <= 1000);

-- Index for filtering by reason (for analytics/reporting)
CREATE INDEX IF NOT EXISTS idx_company_verifications_reason
  ON public.it_run_company_verifications(verification_reason)
  WHERE verification_reason IS NOT NULL;
