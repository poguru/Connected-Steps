-- Referrals v2: reward on registration (not first session)
-- Replaces the referral_invites flow with a cleaner single-table design.

CREATE TABLE IF NOT EXISTS referrals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code  text        NOT NULL,
  referrer_email text        NOT NULL,
  referred_email text        NOT NULL,
  status         text        NOT NULL DEFAULT 'completed',
  -- 'completed'    = referral registered, reward not yet granted
  -- 'reward_issued' = membership extended for both users
  reward_granted boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  rewarded_at    timestamptz,
  UNIQUE (referred_email),   -- one referral per new user, prevents duplicate rewards
  CONSTRAINT fk_ref_referrer FOREIGN KEY (referrer_email)
    REFERENCES users(email) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ref_referred FOREIGN KEY (referred_email)
    REFERENCES users(email) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_email);
CREATE INDEX IF NOT EXISTS idx_referrals_code     ON referrals(referral_code);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
-- Server routes use service-role client which bypasses RLS.
