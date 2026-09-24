-- Add per-participant QR token column.
-- For solo registrations this mirrors it_run_registrations.qr_token.
-- For duo and parent-child registrations each participant gets a distinct token
-- whose payload encodes (registrationCode:participantId) so scanning either
-- QR at check-in resolves the correct individual participant.

ALTER TABLE public.it_run_participants
  ADD COLUMN IF NOT EXISTS qr_token TEXT;
