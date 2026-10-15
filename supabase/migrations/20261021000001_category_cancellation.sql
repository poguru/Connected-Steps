-- ============================================================
-- Migration 20261021000001 — Cancel one category of a booking (an ID rejection)
--
--   1. it_run_participants.cancelled_at / cancelled_reason: a runner whose category was cancelled. Their seats are
--      released and they are left out of confirmations and check-in. Other runners in the booking are not changed.
--   2. A new refund request kind, 'category_cancel': a fixed amount (90% of that category's share, set when the
--      rejection is recorded) that refunds part of the payment. It names the category it cancels (target_category_id).
--      Executing it does not cancel the whole registration; the registration is cancelled only when no runner is left.
--
-- Additive. Existing rows are not changed. Not yet applied: needs review and explicit approval before it runs.
-- ============================================================

ALTER TABLE public.it_run_participants
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

CREATE INDEX IF NOT EXISTS it_run_participants_active_idx
  ON public.it_run_participants (registration_id)
  WHERE cancelled_at IS NULL;

DO $$
BEGIN
  ALTER TABLE public.it_run_refund_requests DROP CONSTRAINT IF EXISTS it_run_refund_requests_kind_check;
  ALTER TABLE public.it_run_refund_requests ADD CONSTRAINT it_run_refund_requests_kind_check
    CHECK (request_kind IN ('full_refund', 'downgrade', 'id_failure', 'category_cancel'));

  ALTER TABLE public.it_run_refund_requests DROP CONSTRAINT IF EXISTS it_run_refund_requests_downgrade_shape_check;
  ALTER TABLE public.it_run_refund_requests ADD CONSTRAINT it_run_refund_requests_downgrade_shape_check
    CHECK (
      (request_kind = 'full_refund' AND requested_amount_paise IS NULL AND target_category_id IS NULL)
      OR
      (request_kind = 'downgrade' AND requested_amount_paise > 0 AND target_category_id IS NOT NULL)
      OR
      (request_kind = 'id_failure' AND requested_amount_paise > 0 AND target_category_id IS NULL)
      OR
      (request_kind = 'category_cancel' AND requested_amount_paise > 0 AND target_category_id IS NOT NULL)
    );
END $$;
