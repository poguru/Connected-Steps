-- Phase 2: Configurable Registration Flow Steps
-- Allows admins to define the step-by-step flow of the registration form
-- per event. When no steps are configured the form renders as a single page
-- (existing behaviour preserved for all current events).

CREATE TABLE IF NOT EXISTS public.event_registration_steps (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Identification
  step_key      TEXT        NOT NULL,   -- slug: 'personal', 'medical', 'payment', etc.
  label         TEXT        NOT NULL,   -- displayed in progress indicator
  description   TEXT,                  -- shown at the top of the step

  -- Ordering & visibility
  display_order SMALLINT    NOT NULL DEFAULT 0,
  is_visible    BOOLEAN     NOT NULL DEFAULT true,
  is_required   BOOLEAN     NOT NULL DEFAULT true,

  -- Behaviour
  -- standard   = standard built-in section (personal, medical, category, tshirt)
  -- custom     = only shows form_fields assigned to this step
  -- payment    = payment summary + submit button
  -- confirmation = final summary screen (no inputs)
  step_type     TEXT        NOT NULL DEFAULT 'standard',

  -- Icon shown in progress bar (emoji or icon key)
  icon          TEXT        DEFAULT '📋',

  -- For 'custom' steps: which event_form_fields.field_key values live here.
  -- For 'standard' steps: which built-in sections (personal, medical, category, tshirt, notes).
  field_scope   TEXT[]      NOT NULL DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (event_id, step_key)
);

CREATE INDEX IF NOT EXISTS event_reg_steps_event_idx
  ON public.event_registration_steps (event_id, display_order);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.event_registration_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.event_registration_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admins_manage_steps" ON public.event_registration_steps
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE email = auth.email() AND role IN ('admin', 'coach'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE email = auth.email() AND role IN ('admin', 'coach'))
  );

-- Public can read step definitions for published events (needed to render the form).
CREATE POLICY "public_read_steps" ON public.event_registration_steps
  FOR SELECT TO anon, authenticated
  USING (
    is_visible = true
    AND EXISTS (
      SELECT 1 FROM public.events WHERE id = event_registration_steps.event_id AND status = 'published'
    )
  );

COMMENT ON TABLE  public.event_registration_steps IS 'Per-event configurable registration workflow steps. Empty = single-page form (default).';
COMMENT ON COLUMN public.event_registration_steps.field_scope IS
  'For standard steps: built-in section keys (personal|medical|category|tshirt|notes|emergency).
   For custom steps: event_form_fields.field_key values that appear in this step.';
