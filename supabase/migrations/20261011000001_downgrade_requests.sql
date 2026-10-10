-- ============================================================
-- Migration 20261011000001 — Downgrade requests (admin-reviewed partial refund)
--
-- Adds two things to it_run_refund_requests so a participant can ask to move to a
-- cheaper category and receive the difference:
--   request_kind          'full_refund' (existing behaviour, the default) or 'downgrade'
--   requested_amount_paise  the difference to refund, in paise (downgrades only)
--   target_category_id      the category to move to once the refund is processed
--
-- Additive and idempotent. Existing rows become 'full_refund' with no amount and no target,
-- so the current refund flow is unchanged. Nothing is dropped or rewritten.
-- ============================================================

ALTER TABLE public.it_run_refund_requests
  ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT 'full_refund',
  ADD COLUMN IF NOT EXISTS requested_amount_paise INTEGER,
  ADD COLUMN IF NOT EXISTS target_category_id UUID REFERENCES public.it_run_categories(id);

DO $$
BEGIN
  ALTER TABLE public.it_run_refund_requests DROP CONSTRAINT IF EXISTS it_run_refund_requests_kind_check;
  ALTER TABLE public.it_run_refund_requests ADD CONSTRAINT it_run_refund_requests_kind_check
    CHECK (request_kind IN ('full_refund', 'downgrade'));

  ALTER TABLE public.it_run_refund_requests DROP CONSTRAINT IF EXISTS it_run_refund_requests_downgrade_shape_check;
  ALTER TABLE public.it_run_refund_requests ADD CONSTRAINT it_run_refund_requests_downgrade_shape_check
    CHECK (
      (request_kind = 'full_refund' AND requested_amount_paise IS NULL AND target_category_id IS NULL)
      OR
      (request_kind = 'downgrade' AND requested_amount_paise > 0 AND target_category_id IS NOT NULL)
    );
END $$;
