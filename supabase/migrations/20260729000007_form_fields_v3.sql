-- Form Fields V3: add is_hidden, is_readonly, min_length, validation_rules
-- These columns support the full Dynamic Form Builder spec.

ALTER TABLE public.event_form_fields
  ADD COLUMN IF NOT EXISTS is_hidden        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_readonly      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_length       INTEGER,
  ADD COLUMN IF NOT EXISTS validation_rules JSONB   NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.event_form_fields.is_hidden        IS 'Hidden from participants but can store pre-filled data';
COMMENT ON COLUMN public.event_form_fields.is_readonly      IS 'Shown to participants but not editable';
COMMENT ON COLUMN public.event_form_fields.min_length       IS 'Minimum character count for text fields';
COMMENT ON COLUMN public.event_form_fields.validation_rules IS 'Extra validation: {min_value, max_value, allowed_types, max_file_size_mb, max_files}';
