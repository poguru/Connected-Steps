-- Unified Events table.
-- Replaces the disconnected run_events/sessions split on the homepage.
-- Existing run_events rows are migrated in; original IDs preserved so
-- coupon event_id FK references stay valid.

CREATE TABLE IF NOT EXISTS events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text        NOT NULL,
  description          text,
  event_type           text        NOT NULL DEFAULT 'running',
  -- running | cycling | training | race | community | workshop
  cover_image          text,
  start_date           date        NOT NULL,
  start_time           text,
  end_date             date,
  end_time             text,
  location             text        NOT NULL,
  organizer            text,
  max_participants     integer,
  registration_required boolean    NOT NULL DEFAULT true,
  status               text        NOT NULL DEFAULT 'draft',
  -- draft | published
  share_slug           text        UNIQUE,
  view_count           integer     NOT NULL DEFAULT 0,
  share_count          integer     NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_status_date ON events(status, start_date);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Migrate existing run_events rows (preserves IDs so coupon references survive)
INSERT INTO events (id, title, description, start_date, start_time, location, status, event_type, share_slug, created_at)
SELECT
  id,
  name,
  description,
  COALESCE(date, CURRENT_DATE),
  NULLIF(trim(time), ''),
  location,
  CASE WHEN is_live THEN 'published' ELSE 'draft' END,
  CASE
    WHEN lower(name) LIKE '%cycl%'     THEN 'cycling'
    WHEN lower(name) LIKE '%rac%'      THEN 'race'
    WHEN lower(name) LIKE '%workshop%' THEN 'workshop'
    WHEN lower(name) LIKE '%communit%' THEN 'community'
    WHEN lower(name) LIKE '%train%'    THEN 'training'
    ELSE                                    'running'
  END,
  lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || substr(md5(id::text), 1, 6),
  created_at
FROM run_events
ON CONFLICT (id) DO NOTHING;
