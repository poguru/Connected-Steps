-- Add phone OTP security columns to users table.
-- These are used by the Meta WhatsApp OTP flow for login and post-login verification.
-- Registration-time phone OTPs (before account creation) use otp_verifications instead.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_hash           TEXT,
  ADD COLUMN IF NOT EXISTS otp_expires_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_attempts       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_last_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_resend_count   INTEGER NOT NULL DEFAULT 0;

-- Index for quickly finding users with an active (unexpired) OTP
CREATE INDEX IF NOT EXISTS idx_users_otp_expires
  ON public.users (otp_expires_at)
  WHERE otp_expires_at IS NOT NULL;

COMMENT ON COLUMN public.users.phone_verified_at IS 'Timestamp when phone_verified was first set to true.';
COMMENT ON COLUMN public.users.otp_hash          IS 'bcrypt hash of the current 6-digit phone OTP. Cleared after successful verification.';
COMMENT ON COLUMN public.users.otp_expires_at    IS '5-minute OTP expiry window. Null when no active OTP.';
COMMENT ON COLUMN public.users.otp_attempts      IS 'Consecutive wrong-code attempts for the current OTP. Reset to 0 on each new send.';
COMMENT ON COLUMN public.users.otp_last_sent_at  IS 'When the most recent OTP was dispatched (rate-limit anchor).';
COMMENT ON COLUMN public.users.otp_resend_count  IS 'Number of OTPs sent in the current 15-minute window. Reset when window expires.';
