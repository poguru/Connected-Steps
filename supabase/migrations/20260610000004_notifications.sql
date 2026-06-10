-- ============================================================
-- Connected Steps — In-App Notifications Table
-- File: 20260610000004_notifications.sql
-- Date: 2026-06-10
-- ============================================================

CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  text        NOT NULL,
  type        text        NOT NULL,   -- see types below
  title       text        NOT NULL,
  body        text        NOT NULL,
  action_url  text,                   -- relative path to navigate on tap
  read_at     timestamptz,            -- null = unread
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Types used in application code:
--   'session_reminder'   – session happening tomorrow/today
--   'coach_message'      – coach sent you a message
--   'achievement'        – badge milestone reached
--   'membership_expiry'  – membership expiring in N days
--   'new_session'        – new session announced

CREATE INDEX notifications_user_email_idx ON notifications (user_email, created_at DESC);
CREATE INDEX notifications_unread_idx     ON notifications (user_email, read_at) WHERE read_at IS NULL;

-- RLS: blocked to anon; all access via service role
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
