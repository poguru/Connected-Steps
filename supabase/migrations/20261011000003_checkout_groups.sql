-- ============================================================
-- Migration 20261011000003 — One payment for several registrations (checkout groups)
--
-- A checkout can hold several registrations (for example a Duo and a 10K) paid by one Razorpay payment.
-- Two things in the current schema assume one payment belongs to one registration:
--   1. it_run_regs_payment_id_unique: one razorpay_payment_id per registration row. Replaced below by
--      it_run_payments, which records each captured payment once. A shared payment can then be recorded
--      against every registration it covers.
--   2. Lookups by order id expect one row. Indexed here, since the rows are now looked up as a set.
--
-- Additive and idempotent. No registration, payment or QR data is changed.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.it_run_payments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_payment_id TEXT        NOT NULL UNIQUE,
  razorpay_order_id   TEXT        NOT NULL,
  amount_paise        INTEGER     NOT NULL CHECK (amount_paise > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS it_run_payments_order_idx ON public.it_run_payments (razorpay_order_id);

ALTER TABLE public.it_run_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "it_run_payments_no_direct_access" ON public.it_run_payments;
CREATE POLICY "it_run_payments_no_direct_access" ON public.it_run_payments FOR ALL USING (false);

-- The one-registration-per-payment unique index is replaced by a plain index
DROP INDEX IF EXISTS public.it_run_regs_payment_id_unique;
CREATE INDEX IF NOT EXISTS it_run_regs_payment_id_idx
  ON public.it_run_registrations (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS it_run_regs_order_id_idx
  ON public.it_run_registrations (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;
