-- ============================================================
-- IT Run Sprint-2: Add BIB Name field + age/phone validation
-- File: 20261008000001_add_bib_name_and_validations.sql
-- Date: 2026-10-08
--
-- Changes:
-- 1. Add bib_name column to it_run_participants (required)
-- 2. Add confirmation_email_sent_at for idempotent email sends
-- ============================================================

-- Add bib_name column (required, not null after backfill)
ALTER TABLE it_run_participants
  ADD COLUMN IF NOT EXISTS bib_name TEXT;

-- Backfill existing participants with bib_name derived from first_name
UPDATE it_run_participants
  SET bib_name = UPPER(TRIM(first_name))
  WHERE bib_name IS NULL;

-- Make it required for future inserts
ALTER TABLE it_run_participants
  ALTER COLUMN bib_name SET NOT NULL;

-- Add tracking column for confirmation email sends (for idempotency)
ALTER TABLE it_run_registrations
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

-- ── Constraints and indexes ──

-- BIB names should be indexed for admin/lookup purposes
CREATE INDEX IF NOT EXISTS idx_itr_part_bib_name ON it_run_participants(event_id, bib_name);

COMMENT ON COLUMN it_run_participants.bib_name IS 'Name to be printed on race BIB (required, unique per registration)';
COMMENT ON COLUMN it_run_registrations.confirmation_email_sent_at IS 'Timestamp when confirmation email was sent (for idempotent retries)';
