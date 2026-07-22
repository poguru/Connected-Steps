-- Safety-net: grandfather any remaining users with email_verified=false.
-- These are accounts created during the broken RLS window (2026-07-21 to 2026-07-22)
-- where the email_verification_tokens INSERT was blocked, so their email was
-- never actually verified but the account exists. Treat them as verified so
-- they are not permanently locked out.
UPDATE public.users
SET email_verified = true
WHERE email_verified = false;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
