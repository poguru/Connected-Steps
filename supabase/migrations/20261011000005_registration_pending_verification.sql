-- Two-stage confirmation: a registration is paid first, then held as pending_verification until an admin has verified
-- the ID of every adult. Only then does it become 'active' (confirmed) and the confirmation email is sent.
--
-- Existing rows keep their status (live registrations are not changed). Idempotent.

ALTER TABLE public.it_run_registrations
  DROP CONSTRAINT IF EXISTS it_run_registrations_registration_status_check;

ALTER TABLE public.it_run_registrations
  ADD CONSTRAINT it_run_registrations_registration_status_check
  CHECK (registration_status IN ('active', 'cancelled', 'pending_verification'));
