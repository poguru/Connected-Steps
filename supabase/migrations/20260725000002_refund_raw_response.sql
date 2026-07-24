-- ============================================================
-- Connected Steps — Store full Razorpay refund response
-- File: 20260725000002_refund_raw_response.sql
-- ============================================================

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS refund_raw_response JSONB;  -- full Razorpay refund object for debugging
