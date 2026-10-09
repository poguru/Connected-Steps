-- Migration: 20261010000003_id_not_provided.sql
--
-- Adds an explicit "not_provided" identity-verification state. A participant who continues without
-- uploading an ID was recorded as need_clarification, which looked like a failed or open review.
--
-- 1. Widen the verification_status check to include not_provided. Widening is backward compatible:
--    every existing value remains valid.
-- 2. Correct existing rows that were marked need_clarification only because no ID was uploaded.
--    Only rows with no document on file AND no admin decision in it_run_company_verifications are
--    changed. Anything an admin reviewed keeps its status.
--
-- Safe to re-run. No registration, payment, QR, BIB, or capacity data is touched.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.it_run_participants'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%verification_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.it_run_participants DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.it_run_participants
  ADD CONSTRAINT it_run_participants_verification_status_check
  CHECK (verification_status IN ('not_provided', 'pending', 'verified', 'rejected', 'need_clarification'));

UPDATE public.it_run_participants p
SET verification_status = 'not_provided'
WHERE p.verification_status = 'need_clarification'
  AND p.company_id_url IS NULL
  AND p.participant_type IS DISTINCT FROM 'child'
  AND NOT EXISTS (
    SELECT 1 FROM public.it_run_company_verifications v WHERE v.participant_id = p.id
  );
