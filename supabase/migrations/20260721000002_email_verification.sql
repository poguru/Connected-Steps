-- Email verification infrastructure
-- Adds email_verified flag to users; grandfathers all existing users.
-- Creates a token table for the signup email-verification flow.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- Grandfather every existing user so no one gets locked out
UPDATE public.users SET email_verified = true;

-- Tokens are keyed by email (not user id) so they can exist before the account is created.
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  token_hash  TEXT        NOT NULL,
  verified    BOOLEAN     NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token_hash)
);

CREATE INDEX IF NOT EXISTS idx_evt_email      ON public.email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_evt_token_hash ON public.email_verification_tokens(token_hash);

-- Only the service role may access this table (no user-facing RLS)
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.email_verification_tokens
  USING (false)
  WITH CHECK (false);
