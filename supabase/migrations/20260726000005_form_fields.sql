-- Phase 4: Dynamic Form Builder
-- Allows admins to define custom registration form fields per event.
-- Responses are stored as JSONB on event_registrations.

-- ── 1. Custom field definitions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_form_fields (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID      NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Identity
  field_key     TEXT      NOT NULL,      -- machine-readable key, e.g. "running_club"
  field_type    TEXT      NOT NULL DEFAULT 'text',
  -- text | textarea | select | number | date | checkbox

  -- Display
  label         TEXT      NOT NULL,
  placeholder   TEXT,
  help_text     TEXT,

  -- Behaviour
  required      BOOLEAN   NOT NULL DEFAULT false,
  options       JSONB     NOT NULL DEFAULT '[]',  -- string[] for select/checkbox-group
  display_order SMALLINT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN   NOT NULL DEFAULT true,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(event_id, field_key)
);

CREATE INDEX IF NOT EXISTS event_form_fields_event_idx
  ON public.event_form_fields (event_id, display_order)
  WHERE is_active = true;

ALTER TABLE public.event_form_fields ENABLE ROW LEVEL SECURITY;

-- service role full access
CREATE POLICY "service_role_all" ON public.event_form_fields
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- admins and coaches can manage
CREATE POLICY "admins_manage_form_fields" ON public.event_form_fields
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = auth.email()
        AND role IN ('admin', 'coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = auth.email()
        AND role IN ('admin', 'coach')
    )
  );

-- public read for active fields on published events
CREATE POLICY "public_read_active_fields" ON public.event_form_fields
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_form_fields.event_id
        AND status = 'published'
    )
  );

-- ── 2. Store custom field responses on registrations ──────────────────────────

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}';

COMMENT ON TABLE  public.event_form_fields IS 'Per-event custom form field definitions for the registration flow.';
COMMENT ON COLUMN public.event_form_fields.field_key IS 'Snake_case identifier used as the key in event_registrations.custom_fields JSON.';
COMMENT ON COLUMN public.event_form_fields.options   IS 'Array of string option labels for select/radio field types.';
COMMENT ON COLUMN public.event_registrations.custom_fields IS 'Map of field_key → value submitted by the registrant for custom form fields.';
