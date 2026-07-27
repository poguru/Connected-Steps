-- Phase 3: Registration Step Builder
-- Adds a per-event JSONB configuration column for the participant registration form.
-- Controls which fields are required, optional, or hidden, and whether the form
-- renders as a single page (default) or a multi-step flow.
--
-- Default config (applied in application code when column is null):
-- {
--   "require_gender": true,
--   "require_dob": true,
--   "require_blood_group": true,
--   "require_emergency_contact": true,
--   "show_notes": true,
--   "notes_label": "Notes",
--   "notes_placeholder": "Medical conditions, dietary needs, or questions. Enter NA if none.",
--   "multi_step": false
-- }
--
-- Existing events with null registration_config continue to behave exactly as before.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS registration_config JSONB;
