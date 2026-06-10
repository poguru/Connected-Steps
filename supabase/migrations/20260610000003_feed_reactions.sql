-- ============================================================
-- Connected Steps — Feed Reactions Table
-- File: 20260610000003_feed_reactions.sql
-- Date: 2026-06-10
--
-- Stores likes and celebrate reactions on synthetic feed events.
-- Feed events are not stored rows — they are computed from
-- session_attendance, session_photos, and users tables.
-- We use the computed event ID string as the foreign key.
--
-- One reaction per user per event (can switch type).
-- ============================================================

CREATE TABLE feed_reactions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_event_id  text        NOT NULL,
  user_email     text        NOT NULL,
  reaction_type  text        NOT NULL CHECK (reaction_type IN ('like', 'celebrate')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_event_id, user_email)
);

CREATE INDEX feed_reactions_event_id_idx ON feed_reactions (feed_event_id);
CREATE INDEX feed_reactions_user_idx     ON feed_reactions (user_email);

-- RLS: block anon as per security migration 000001
ALTER TABLE feed_reactions ENABLE ROW LEVEL SECURITY;
-- No policies: all access via service role (API routes)
