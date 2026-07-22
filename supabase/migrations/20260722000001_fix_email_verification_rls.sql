-- Fix RLS on email_verification_tokens.
-- The original policy used USING(false)/WITH CHECK(false) without a TO clause,
-- which blocks ALL roles including service_role in this Supabase project.
-- Replace with the explicit TO service_role grant pattern used by email_queue.

DROP POLICY IF EXISTS "service role only" ON public.email_verification_tokens;

CREATE POLICY "service_role_all" ON public.email_verification_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
