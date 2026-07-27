-- Phase 2: Event Templates
-- Stores reusable event configurations that can be applied when creating a new event.
-- Intentionally omits date/time, location, and registration-window fields — those are
-- event-specific and must be filled in each time.

CREATE TABLE IF NOT EXISTS public.event_templates (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  text        NOT NULL,
  -- Core event configuration
  event_category        text        NOT NULL DEFAULT 'community',
  event_type            text        NOT NULL DEFAULT 'running',
  event_description     text,
  organizer             text,
  organizer_email       text,
  organizer_phone       text,
  support_email         text,
  website               text,
  cover_image           text,
  -- Registration defaults
  max_participants      int,
  waiting_list_enabled  boolean     NOT NULL DEFAULT false,
  require_login         boolean     NOT NULL DEFAULT true,
  approval_required     boolean     NOT NULL DEFAULT false,
  collect_tshirt        boolean     NOT NULL DEFAULT false,
  refund_policy         text,
  cancellation_policy   text,
  visibility            text        NOT NULL DEFAULT 'public',
  -- Race configurations in the same shape as the wizard RaceForm
  -- (name, distance, price, max_slots, reporting_time, gun_time, timing_chip, auto_bib,
  --  gender_restriction, min_age, max_age, description — all as strings for direct form binding)
  races                 jsonb       NOT NULL DEFAULT '[]',
  -- Meta
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS event_templates_created_at_idx ON public.event_templates(created_at DESC);

ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;

-- Only admins and coaches can create, read, update, or delete templates.
CREATE POLICY "Admins and coaches can manage event templates"
  ON public.event_templates
  FOR ALL
  TO authenticated
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

COMMENT ON TABLE  public.event_templates IS 'Reusable event configurations. Dates, venue, and registration window must be supplied at event-creation time.';
COMMENT ON COLUMN public.event_templates.races IS 'Array of RaceForm objects (wizard shape) — strings for price/slots/ages, booleans for flags.';
