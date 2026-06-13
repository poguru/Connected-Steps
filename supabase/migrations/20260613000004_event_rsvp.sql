-- Event RSVP table — tracks who has registered for each event.

CREATE TABLE IF NOT EXISTS event_rsvp (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_email     text        NOT NULL,
  user_name      text,
  registered_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvp_event ON event_rsvp(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_email ON event_rsvp(user_email);

ALTER TABLE event_rsvp ENABLE ROW LEVEL SECURITY;
