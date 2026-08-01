-- Performance indexes — Phase 3
-- Adds composite indexes for the highest-frequency query patterns identified
-- in the API audit. All are IF NOT EXISTS and advisory — they improve read
-- performance with no data change and can be dropped without data loss.

-- ── event_registrations ───────────────────────────────────────────────────────

-- Most common admin/ops lookup: all registrations for an event, optionally
-- filtered by status or distance_category (capacity gate, attendance report).
-- Existing single-column idx_event_reg_event forces a filter+sort over all rows.
CREATE INDEX IF NOT EXISTS idx_event_reg_event_status
  ON event_registrations (event_id, status)
  WHERE status IN ('confirmed', 'pending_payment');

-- Capacity gate counts registrations per race category:
--   .eq("event_id", ...).eq("distance_category", ...).eq("status", "confirmed")
CREATE INDEX IF NOT EXISTS idx_event_reg_event_category_status
  ON event_registrations (event_id, distance_category, status)
  WHERE status = 'confirmed';

-- User's own registrations (dashboard / my-registrations):
--   .eq("user_email", ...).order("created_at", desc)
-- Composite beats separate user_email + created_at indexes on larger tables.
CREATE INDEX IF NOT EXISTS idx_event_reg_user_created
  ON event_registrations (user_email, created_at DESC);

-- BIB & ops portal lookups: event_id + bib_collected_at is a hot filter
-- during event day ops (NULL = not yet collected).
CREATE INDEX IF NOT EXISTS idx_event_reg_event_bib
  ON event_registrations (event_id, bib_collected_at)
  WHERE bib_collected_at IS NULL;

-- ── leaderboard ───────────────────────────────────────────────────────────────

-- Primary leaderboard read: ORDER BY month_points DESC filtered to a month.
-- The existing idx_leaderboard_month_points only covers month_points DESC.
-- Adding points_month as leading column lets Postgres skip rows from other months.
CREATE INDEX IF NOT EXISTS idx_leaderboard_month_sorted
  ON leaderboard (points_month, month_points DESC);

-- Admin user list & digest: lookup by user_email (unique in practice but no index).
CREATE INDEX IF NOT EXISTS idx_leaderboard_user_email
  ON leaderboard (user_email);

-- ── session_attendance ────────────────────────────────────────────────────────

-- Attendance report & QR scan validation: session_id + attended filter.
-- Existing idx_session_attendance_attended_user_idx may not cover this combo.
CREATE INDEX IF NOT EXISTS idx_session_att_session_attended
  ON session_attendance (session_id, attended)
  WHERE attended = true;

-- Streak & birthday-wishes: user attendance across all sessions by email.
CREATE INDEX IF NOT EXISTS idx_session_att_user_session
  ON session_attendance (user_email, session_id);

-- ── email_campaigns ───────────────────────────────────────────────────────────

-- Cron sender polls for active/paused campaigns; added in Phase 2 but no index.
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_created
  ON email_campaigns (status, created_at DESC)
  WHERE status IN ('active', 'paused');

-- ── job_queue ─────────────────────────────────────────────────────────────────

-- The existing job_queue_pending_idx covers priority+created_at but the worker
-- RPC also filters by run_after <= now(). Adding run_after as leading column
-- on a partial pending index lets Postgres skip future-scheduled rows cheaply.
CREATE INDEX IF NOT EXISTS idx_job_queue_pending_run_after
  ON job_queue (run_after, job_type)
  WHERE status = 'pending';

-- ── notifications ─────────────────────────────────────────────────────────────

-- Unread badge count: .eq("user_email",...).is("read_at", null)
-- Existing notifications_unread_idx covers this but may lack the email prefix.
-- This is a no-op if the existing index already covers it (IF NOT EXISTS guard).
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_email, created_at DESC)
  WHERE read_at IS NULL;
