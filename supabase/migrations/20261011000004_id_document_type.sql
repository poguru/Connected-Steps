-- ============================================================
-- Migration 20261011000004 — Record which kind of ID a participant uploaded
--
-- company_id_url holds the uploaded document of either kind. id_document_type records which kind it is, so
-- admin review, approval emails and staff views can tell a company ID from a government ID.
--
-- Additive and idempotent. The backfill only fills the type for documents that already exist, and only with
-- "company", which is the only kind uploaded so far. No registration, payment or QR data changes.
-- ============================================================

ALTER TABLE public.it_run_participants
  ADD COLUMN IF NOT EXISTS id_document_type TEXT;

DO $$
BEGIN
  ALTER TABLE public.it_run_participants DROP CONSTRAINT IF EXISTS it_run_participants_id_document_type_check;
  ALTER TABLE public.it_run_participants ADD CONSTRAINT it_run_participants_id_document_type_check
    CHECK (id_document_type IS NULL OR id_document_type IN ('company', 'government'));
END $$;

UPDATE public.it_run_participants
   SET id_document_type = 'company'
 WHERE company_id_url IS NOT NULL
   AND id_document_type IS NULL;
