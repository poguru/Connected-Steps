-- Add administrative status and notes fields to it_run_registrations.
-- registration_status is separate from payment_status:
--   payment_status: tracks Razorpay payment outcome (paid/pending/failed/free)
--   registration_status: tracks admin lifecycle (active/cancelled)
--
-- Cancellation is soft-delete only. Paid registrations require explicit
-- confirmation before cancellation. Historical data is never deleted.

ALTER TABLE public.it_run_registrations
  ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'active'
    CHECK (registration_status IN ('active', 'cancelled')),
  ADD COLUMN IF NOT EXISTS cancelled_reason   TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes        TEXT;

CREATE INDEX IF NOT EXISTS idx_it_run_registrations_status
  ON public.it_run_registrations (registration_status);
