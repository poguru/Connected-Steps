-- Event Operations: Checkpoints + Incidents
-- Supports the Event Operations Command Center (Phase 3)

-- ── Event Checkpoints ─────────────────────────────────────────────────────────
-- Organizers can pre-define milestones (Venue Ready, Flag-off, Breakfast, etc.)
-- and track planned vs. actual completion during the event.

CREATE TABLE IF NOT EXISTS public.event_checkpoints (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label         TEXT         NOT NULL,
  description   TEXT,
  planned_at    TIMESTAMPTZ,
  actual_at     TIMESTAMPTZ,
  status        TEXT         NOT NULL DEFAULT 'pending',
  notes         TEXT,
  owner_email   TEXT,
  display_order SMALLINT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT checkpoint_status_check CHECK (status IN ('pending', 'in_progress', 'done', 'skipped'))
);

CREATE INDEX IF NOT EXISTS event_checkpoints_event_id_idx
  ON public.event_checkpoints (event_id, display_order);

ALTER TABLE public.event_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_checkpoints" ON public.event_checkpoints
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Note: all management access via service_role in API routes — no additional RLS policy needed.

-- ── Event Incidents ───────────────────────────────────────────────────────────
-- Operational incident log: medical, technical, QR failures, volunteer issues, etc.

CREATE TABLE IF NOT EXISTS public.event_incidents (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title         TEXT         NOT NULL,
  incident_type TEXT         NOT NULL DEFAULT 'other',
  priority      TEXT         NOT NULL DEFAULT 'medium',
  status        TEXT         NOT NULL DEFAULT 'open',
  description   TEXT,
  resolution    TEXT,
  owner_email   TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  CONSTRAINT incident_type_check     CHECK (incident_type IN ('medical', 'route', 'traffic', 'payment', 'qr', 'volunteer', 'food', 'technical', 'other')),
  CONSTRAINT incident_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT incident_status_check   CHECK (status   IN ('open', 'in_progress', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS event_incidents_event_id_idx
  ON public.event_incidents (event_id, created_at DESC);

ALTER TABLE public.event_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_incidents" ON public.event_incidents
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Note: all management access via service_role in API routes — no additional RLS policy needed.
