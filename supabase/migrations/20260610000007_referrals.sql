-- Referral codes: one persistent code per user
CREATE TABLE IF NOT EXISTS referral_codes (
  user_email text PRIMARY KEY,
  code       text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_codes_code_idx ON referral_codes (code);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

-- Referral invites: tracks the full referral chain
-- invitee_email is NULL until the invited user claims the referral after signup
CREATE TABLE IF NOT EXISTS referral_invites (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_email   text        NOT NULL,
  invitee_email    text,
  registered_at    timestamptz,
  first_session_at timestamptz,
  rewarded_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_email, invitee_email)
);

CREATE INDEX IF NOT EXISTS referral_invites_referrer_idx  ON referral_invites (referrer_email);
CREATE INDEX IF NOT EXISTS referral_invites_invitee_idx   ON referral_invites (invitee_email);

ALTER TABLE referral_invites ENABLE ROW LEVEL SECURITY;
