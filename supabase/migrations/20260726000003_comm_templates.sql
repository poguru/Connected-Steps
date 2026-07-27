-- Phase 3: Communication Templates
-- Stores reusable email templates (subject + HTML body) for the communicate hub.
-- Admins/coaches can save any composed email as a named template and reload it later.

CREATE TABLE IF NOT EXISTS public.comm_templates (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  subject     text        NOT NULL DEFAULT '',
  body_html   text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS comm_templates_created_at_idx ON public.comm_templates(created_at DESC);

ALTER TABLE public.comm_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches can manage comm templates"
  ON public.comm_templates
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

COMMENT ON TABLE  public.comm_templates IS 'Reusable email templates for the event communication hub.';
COMMENT ON COLUMN public.comm_templates.body_html IS 'Rich HTML from the TipTap editor — sanitized before storage by the API.';
