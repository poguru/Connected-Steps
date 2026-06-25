CREATE TABLE IF NOT EXISTS public.event_comm_history (
  id         BIGSERIAL    PRIMARY KEY,
  event_id   UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  subject    TEXT         NOT NULL,
  recipients INTEGER      NOT NULL DEFAULT 0,
  sent       INTEGER      NOT NULL DEFAULT 0,
  failed     INTEGER      NOT NULL DEFAULT 0,
  status     TEXT         NOT NULL DEFAULT 'sent',
  filter     TEXT,
  sent_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_comm_history_event_idx ON public.event_comm_history (event_id, sent_at DESC);

ALTER TABLE public.event_comm_history ENABLE ROW LEVEL SECURITY;
-- Service role only
