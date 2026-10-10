-- ============================================================
-- Migration 20261011000002 — Original paid amount for downgrade-aware refunds
--
-- A downgrade moves a registration to a cheaper category and sets its final_price to the new price.
-- Refund limits must still be measured against what was originally paid, otherwise a partial
-- downgrade refund could look like a full refund and cancel the registration.
--
-- amount_paid_paise is the original amount actually paid, in paise. It is set once, before the first
-- downgrade changes final_price. NULL means "no downgrade yet": the paid amount is final_price * 100.
--
-- Additive and idempotent. No rows are rewritten.
-- ============================================================

ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS amount_paid_paise INTEGER;

DO $$
BEGIN
  ALTER TABLE public.it_run_registrations DROP CONSTRAINT IF EXISTS it_run_registrations_amount_paid_check;
  ALTER TABLE public.it_run_registrations ADD CONSTRAINT it_run_registrations_amount_paid_check
    CHECK (amount_paid_paise IS NULL OR amount_paid_paise >= 0);
END $$;
