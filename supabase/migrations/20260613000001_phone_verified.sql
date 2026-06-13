-- Add phone_verified flag to the users table.
-- DEFAULT FALSE means every existing user starts unverified — the app will
-- prompt them to verify after their next login, without blocking access.
-- New accounts created after this migration will have phone_verified set to
-- TRUE once the phone OTP step in signup is completed.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index used by the "unverified users" admin query and the
-- post-login banner decision (very small expected cardinality over time).
CREATE INDEX IF NOT EXISTS idx_users_phone_verified
  ON public.users (phone_verified)
  WHERE phone_verified = FALSE;

COMMENT ON COLUMN public.users.phone_verified IS
  'TRUE once the user has verified their mobile number via WhatsApp OTP.';
