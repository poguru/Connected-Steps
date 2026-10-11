-- ID verification failure refunds (admin-confirmed).
--
-- A new refund request kind, 'id_failure'. It carries the amount to refund (requested_amount_paise) and no target
-- category. Executing it refunds that amount and cancels the registration, even though the refund is partial.
--
-- Additive and idempotent. Existing 'full_refund' and 'downgrade' rows are not changed.

DO $$
BEGIN
  ALTER TABLE public.it_run_refund_requests DROP CONSTRAINT IF EXISTS it_run_refund_requests_kind_check;
  ALTER TABLE public.it_run_refund_requests ADD CONSTRAINT it_run_refund_requests_kind_check
    CHECK (request_kind IN ('full_refund', 'downgrade', 'id_failure'));

  ALTER TABLE public.it_run_refund_requests DROP CONSTRAINT IF EXISTS it_run_refund_requests_downgrade_shape_check;
  ALTER TABLE public.it_run_refund_requests ADD CONSTRAINT it_run_refund_requests_downgrade_shape_check
    CHECK (
      (request_kind = 'full_refund' AND requested_amount_paise IS NULL AND target_category_id IS NULL)
      OR
      (request_kind = 'downgrade' AND requested_amount_paise > 0 AND target_category_id IS NOT NULL)
      OR
      (request_kind = 'id_failure' AND requested_amount_paise > 0 AND target_category_id IS NULL)
    );
END $$;
