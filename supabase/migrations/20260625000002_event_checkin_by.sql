-- Track which admin performed the check-in
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS checked_in_by TEXT;
