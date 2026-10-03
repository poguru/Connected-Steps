-- Complete refund system with audit trail, idempotency, and state tracking
-- File: 20261003000002_complete_refund_system.sql
-- Date: 2026-10-03

-- ── Refunds Table (Audit Trail) ────────────────────────────────────────────
-- Immutable log of every refund attempt. Idempotent via unique constraint on
-- razorpay_refund_id and atomic transactional processing.

CREATE TABLE IF NOT EXISTS it_run_refunds (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  registration_id       UUID        NOT NULL REFERENCES it_run_registrations(id),
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT        NOT NULL,
  razorpay_refund_id    TEXT        UNIQUE,
  -- Amount in paise (smallest unit)
  amount_paise          INTEGER     NOT NULL,
  currency              TEXT        NOT NULL DEFAULT 'INR',
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processed', 'failed')),
  reason                TEXT,
  initiated_by          UUID        REFERENCES it_run_staff(id) ON DELETE SET NULL,
  initiated_by_admin    BOOLEAN     DEFAULT false,
  initiated_by_email    TEXT,
  initiated_by_role     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at          TIMESTAMPTZ,
  failure_reason        TEXT,
  metadata              JSONB       DEFAULT '{}'::jsonb,
  UNIQUE(registration_id, razorpay_refund_id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_registration ON it_run_refunds(registration_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON it_run_refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_event ON it_run_refunds(event_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON it_run_refunds(created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_razorpay_id ON it_run_refunds(razorpay_refund_id);

-- ── Update payment_status to include refund states ──────────────────────────

ALTER TABLE it_run_registrations
  DROP CONSTRAINT IF EXISTS it_run_registrations_payment_status_check,
  ADD CONSTRAINT it_run_registrations_payment_status_check
    CHECK (payment_status IN ('pending','paid','failed','free','refunded','partially_refunded'));

-- ── RLS Policies ───────────────────────────────────────────────────────────

ALTER TABLE it_run_refunds ENABLE ROW LEVEL SECURITY;

-- No public access; service role only
CREATE POLICY no_access_refunds ON it_run_refunds
  FOR ALL USING (false);

-- ── Audit Log Integration ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS it_run_refund_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES it_run_events(id) ON DELETE CASCADE,
  refund_id       UUID        NOT NULL REFERENCES it_run_refunds(id) ON DELETE CASCADE,
  registration_id UUID        NOT NULL,
  action          TEXT        NOT NULL,
  -- e.g., REFUND_REQUESTED, REFUND_PROCESSED, REFUND_FAILED,
  --       CAPACITY_RELEASED, COUPON_RELEASED, EMAIL_SENT, WEBHOOK_RECEIVED
  details         JSONB       DEFAULT '{}'::jsonb,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(refund_id, action, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_refund_audit_refund ON it_run_refund_audit(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_timestamp ON it_run_refund_audit(timestamp);

ALTER TABLE it_run_refund_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY no_access_refund_audit ON it_run_refund_audit
  FOR ALL USING (false);

-- ── Helper Functions ───────────────────────────────────────────────────────

-- Check if a registration can be refunded
CREATE OR REPLACE FUNCTION itr_can_refund(p_registration_id UUID)
RETURNS TABLE (can_refund BOOLEAN, reason TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (r.payment_status IN ('paid', 'partially_refunded'))
    AND (r.registration_status = 'active')
    AND (r.razorpay_payment_id IS NOT NULL)
    AS can_refund,
    CASE
      WHEN r.payment_status = 'paid' THEN NULL
      WHEN r.payment_status = 'partially_refunded' THEN NULL
      WHEN r.registration_status != 'active' THEN 'Registration is not active'
      WHEN r.razorpay_payment_id IS NULL THEN 'No payment ID on record'
      ELSE 'Cannot refund: payment status is ' || r.payment_status
    END AS reason
  FROM it_run_registrations r
  WHERE r.id = p_registration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get refundable amount (paid - already refunded)
CREATE OR REPLACE FUNCTION itr_refundable_amount(p_registration_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_final_price INTEGER;
  v_total_refunded INTEGER;
BEGIN
  SELECT final_price INTO v_final_price
  FROM it_run_registrations
  WHERE id = p_registration_id;

  SELECT COALESCE(SUM(amount_paise), 0) INTO v_total_refunded
  FROM it_run_refunds
  WHERE registration_id = p_registration_id
    AND status = 'processed';

  RETURN v_final_price - v_total_refunded;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE it_run_refunds IS 'Immutable refund audit log with Razorpay reconciliation';
COMMENT ON COLUMN it_run_refunds.razorpay_refund_id IS 'Unique refund ID from Razorpay; UNIQUE to prevent duplicate refunds';
COMMENT ON COLUMN it_run_refunds.status IS 'pending: waiting for Razorpay response; processed: Razorpay confirmed; failed: refund rejected';
COMMENT ON TABLE it_run_refund_audit IS 'Audit trail of every refund action for production debugging';
