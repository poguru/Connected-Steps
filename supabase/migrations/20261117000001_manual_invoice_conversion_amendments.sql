-- ============================================================
-- Migration 20261117000001 — Quotation conversion and invoice amendments
--
-- Adds three columns to manual_invoices, all additive and nullable or defaulted:
--   source_quotation_id  the quotation an invoice was converted from (one invoice per quotation)
--   amends_invoice_id    the invoice a revised draft amends; the original is left untouched
--   revision_no          0 for an original invoice, 1 or more for amendments
--
-- The unique index allows one converted invoice per quotation, enforced by the database as well as by the app.
-- Existing invoices have no source quotation, so they are not affected by the index.
--
-- Not yet applied: needs review and explicit approval before it is run in any environment.
-- ============================================================

ALTER TABLE public.manual_invoices
  ADD COLUMN IF NOT EXISTS source_quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amends_invoice_id   UUID REFERENCES public.manual_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_no         INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS manual_invoices_source_quotation_uidx
  ON public.manual_invoices (source_quotation_id)
  WHERE source_quotation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS manual_invoices_amends_idx
  ON public.manual_invoices (amends_invoice_id)
  WHERE amends_invoice_id IS NOT NULL;
