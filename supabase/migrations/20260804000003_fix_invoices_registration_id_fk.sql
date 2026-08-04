-- Fix: invoices.registration_id was TEXT with no FK, allowing orphan invoices.
-- event_registrations.id is UUID. This migration casts the column and adds
-- the FK with ON DELETE SET NULL (invoice is kept even if registration is removed).
--
-- If any rows contain non-UUID values in registration_id, this migration will fail
-- safely (no data loss) — investigate and clean those rows before re-running.

ALTER TABLE public.invoices
  ALTER COLUMN registration_id TYPE UUID
  USING registration_id::UUID;

ALTER TABLE public.invoices
  ADD CONSTRAINT fk_invoices_registration_id
  FOREIGN KEY (registration_id)
  REFERENCES public.event_registrations(id)
  ON DELETE SET NULL;
