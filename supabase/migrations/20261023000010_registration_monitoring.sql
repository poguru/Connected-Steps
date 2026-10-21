-- ============================================================
-- Migration 20261023000010 — Registration monitoring (IT Run)
--
-- Two tables, both private: a registration journey is one attempt by one person, and a journey event is one stage
-- change or error inside it. Written by the server only (service role). Row-level security is on with no policies,
-- so no browser client can read or write them. Nothing here changes registrations, payments or confirmations.
--
-- Not yet applied: needs review and explicit approval before it is run in any environment.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.registration_journeys (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_key      TEXT        NOT NULL UNIQUE,
  event_id         UUID        REFERENCES public.it_run_events(id) ON DELETE CASCADE,
  current_stage    TEXT        NOT NULL DEFAULT 'landing',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  registration_id  UUID        REFERENCES public.it_run_registrations(id) ON DELETE SET NULL,
  category_id      UUID        REFERENCES public.it_run_categories(id) ON DELETE SET NULL,
  device_category  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_journeys_event_activity_idx
  ON public.registration_journeys (event_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.registration_journey_events (
  id               BIGSERIAL   PRIMARY KEY,
  journey_id       UUID        NOT NULL REFERENCES public.registration_journeys(id) ON DELETE CASCADE,
  event_type       TEXT        NOT NULL,
  stage            TEXT,
  error_code       TEXT,
  http_status      INTEGER,
  endpoint         TEXT,
  duration_ms      INTEGER,
  correlation_id   TEXT,
  idempotency_key  TEXT        UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_journey_events_journey_idx
  ON public.registration_journey_events (journey_id, created_at);
CREATE INDEX IF NOT EXISTS registration_journey_events_created_idx
  ON public.registration_journey_events (created_at);

-- Private: no browser access. The server reads and writes with the service role.
ALTER TABLE public.registration_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_journey_events ENABLE ROW LEVEL SECURITY;
