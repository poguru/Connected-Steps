-- ============================================================
-- Migration 20261022000001 — One open refund per category
--
-- A booking holds one open refund at a time, for whole-booking refunds. A category cancelled for an ID rejection
-- ('category_cancel') is refunded on its own, so a booking may have one open category refund for each category.
--
--   * whole-booking requests (full_refund, downgrade, id_failure): still one open request per registration
--   * category_cancel requests: one open request per registration and category
--
-- Additive: the old index is replaced by one with the same meaning for non-category kinds. Not yet applied: needs
-- review and explicit approval. Apply it after the category-cancellation migration (20261021000001).
-- ============================================================

DROP INDEX IF EXISTS public.it_run_refund_requests_one_open_per_registration;

CREATE UNIQUE INDEX IF NOT EXISTS it_run_refund_requests_one_open_per_registration
  ON public.it_run_refund_requests (registration_id)
  WHERE status IN ('requested', 'approved') AND request_kind <> 'category_cancel';

CREATE UNIQUE INDEX IF NOT EXISTS it_run_refund_requests_one_open_per_category
  ON public.it_run_refund_requests (registration_id, target_category_id)
  WHERE status IN ('requested', 'approved') AND request_kind = 'category_cancel';
