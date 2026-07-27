-- Phase 2: Dynamic Form Builder extensions
-- All changes are additive (IF NOT EXISTS) — zero breaking changes.

-- ── 1. Extended configuration on existing form fields ─────────────────────────

-- Conditional visibility: array of {field_key, operator, value} rules.
-- All conditions in the array must be true for the field to be shown (AND logic).
-- Empty array = always shown.
ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS conditions       JSONB    NOT NULL DEFAULT '[]';

-- Default value pre-filled in the form input.
ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS default_value    TEXT;

-- Character limit for text/textarea fields (NULL = no limit).
ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS max_length       INTEGER;

-- Regex pattern for custom validation (e.g. employee ID format).
ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS validation_pattern TEXT;

-- Whether participants can edit this field after registering.
ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS editable_after_reg BOOLEAN NOT NULL DEFAULT true;

-- Logical grouping / section label shown above this field (e.g. "Medical").
ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS section         TEXT;

-- ── 2. New field_type values (no constraint — just TEXT) ──────────────────────
-- Existing: text, textarea, select, number, date, checkbox
-- New:      email, phone, radio, multi_select, address, waiver, signature, file
-- No migration SQL needed — column is already unconstrained TEXT.

COMMENT ON COLUMN public.event_form_fields.conditions IS
  'JSON array of {field_key, operator, value} rules. All must match (AND) for this field to be visible.
   Operators: equals | not_equals | contains | is_empty | is_not_empty.';

COMMENT ON COLUMN public.event_form_fields.default_value IS
  'Pre-filled value shown in the registration form input.';

COMMENT ON COLUMN public.event_form_fields.max_length IS
  'Maximum character count for text/textarea fields. NULL = unlimited.';

COMMENT ON COLUMN public.event_form_fields.validation_pattern IS
  'ECMAScript regex applied to the field value at registration time.';

COMMENT ON COLUMN public.event_form_fields.editable_after_reg IS
  'When false, participants cannot change this field from their dashboard.';

COMMENT ON COLUMN public.event_form_fields.section IS
  'Optional section heading shown above this field in the registration form.';
