-- Restrict session_qr_codes SELECT access.
-- The original migration used USING(true) which allows any anonymous client
-- to enumerate all active QR tokens directly via Supabase's REST API.
-- All QR validation happens through API routes using the service role key,
-- which bypasses RLS entirely, so no client-facing SELECT policy is needed.

DROP POLICY IF EXISTS "Anyone can read qr codes for scanning" ON session_qr_codes;

-- "Service role can manage qr codes" policy already covers ALL operations
-- for the service role (which bypasses RLS anyway). Leave it in place.
-- Result: anonymous + authenticated Supabase clients have zero direct access.
