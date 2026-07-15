-- Track Razorpay orders created for membership payments.
-- Written when /api/payment/create-order creates the Razorpay order.
-- Marked 'paid' when /api/payment/verify activates the membership.
-- The daily reconcile cron sweeps 'pending' rows that are ≥30 min old
-- and recovers any where Razorpay shows a captured payment but our DB
-- was never updated (network loss, client crash after checkout, etc.).

CREATE TABLE IF NOT EXISTS payment_order_log (
  razorpay_order_id  TEXT        PRIMARY KEY,
  user_email         TEXT        NOT NULL,
  plan               TEXT        NOT NULL,      -- razorpay_plan key (e.g. 'monthly', 'annual')
  amount_paise       INTEGER     NOT NULL,       -- Razorpay order amount in paise
  coupon_id          TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);

-- Speed up the daily reconcile query (pending rows ordered by age)
CREATE INDEX IF NOT EXISTS idx_payment_order_log_pending
  ON payment_order_log (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payment_order_log_user_email
  ON payment_order_log (user_email);

-- RLS: only service role has access — this table is server-side only
ALTER TABLE payment_order_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON payment_order_log;
CREATE POLICY "Service role full access"
  ON payment_order_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
