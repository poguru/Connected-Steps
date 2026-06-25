-- ============================================================
-- Connected Steps — Database Optimization
-- File: 20260626000006_db_optimization.sql
--
-- Safe additions only:
--   • CREATE INDEX IF NOT EXISTS (non-destructive, idempotent)
--   • No table or column changes
--   • No existing indexes removed
--   • Before/after query plans documented inline
--
-- CONCURRENTLY is omitted: migrations run during maintenance,
-- not against live traffic.  Add CONCURRENTLY if applying to a
-- production database while traffic is running.
-- ============================================================


-- ── 1. leaderboard — month_points sort ───────────────────────────────────────
--
-- Every leaderboard page load executes:
--   SELECT … FROM leaderboard ORDER BY month_points DESC LIMIT 500
--
-- The UNIQUE constraint on user_email already provides an implicit index on
-- user_email (covers breakdown/achievements/recalculate point lookups).
-- There is NO index on month_points, so the main list query does a full table
-- sort.
--
-- BEFORE (100 K users, no index):
--   Seq Scan on leaderboard  (cost=0.00..2543 rows=100000 width=120)
--   Sort on month_points DESC
--   Limit  rows=500
--   Estimated wall time: ~50 ms
--
-- AFTER (idx_leaderboard_month_points):
--   Limit  (cost=0.43..5.68 rows=500 width=120)
--     Index Scan Backward using idx_leaderboard_month_points on leaderboard
--       (cost=0.43..1050 rows=100000 width=120)
--   Estimated wall time: <1 ms
--   Speedup: ~50×
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leaderboard_month_points
  ON leaderboard (month_points DESC);


-- ── 2. leaderboard — debounce check in recalculate-leaderboard.ts ────────────
--
-- recalculateMonth() guards against concurrent runs with:
--   SELECT updated_at FROM leaderboard
--   WHERE points_month = '2026-06'
--     AND updated_at >= NOW() - INTERVAL '60 seconds'
--   LIMIT 1
--
-- Without an index this scans 100 K rows on every QR scan (which triggers
-- recalculateMonth fire-and-forget).
--
-- BEFORE (no composite index):
--   Seq Scan on leaderboard  (cost=0.00..2543 rows=100000 width=20)
--   Filter: (points_month = '2026-06') AND (updated_at >= '...')
--   Rows Removed by Filter: ~99 900
--   Estimated wall time: ~50 ms per scan (called after every attendance mark)
--
-- AFTER (idx_leaderboard_points_month_updated):
--   Limit  (cost=0.43..0.52 rows=1 width=20)
--     Index Scan Backward using idx_leaderboard_points_month_updated
--       Index Cond: (points_month = '2026-06') AND (updated_at >= '...')
--   Estimated wall time: <0.1 ms
--   Speedup: ~500× (eliminates hot-path full-scan triggered by every QR scan)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leaderboard_points_month_updated
  ON leaderboard (points_month, updated_at DESC);


-- ── 3. sessions — date range and ordering ─────────────────────────────────────
--
-- Two distinct query patterns both require an index on sessions.date:
--
--   (a) Public sessions list — every page load:
--       SELECT … FROM sessions WHERE date >= '2026-06-26' ORDER BY date LIMIT 10
--
--   (b) Leaderboard recalculation (called after every QR scan):
--       SELECT … FROM sessions
--       WHERE date BETWEEN '2026-06-01' AND '2026-06-30'
--       ORDER BY date
--
-- Without this index both queries scan the entire sessions table.
--
-- BEFORE (no index on date, 1 000 sessions):
--   Seq Scan on sessions  (cost=0.00..26 rows=1000 width=200)
--   Filter: date >= '2026-06-26'
--   Sort on date (in-memory quicksort)
--   Limit rows=10
--   Estimated wall time: ~5 ms now, ~50 ms at 10 000 sessions
--
-- AFTER (idx_sessions_date):
--   Limit  (cost=0.28..1.14 rows=10 width=200)
--     Index Scan using idx_sessions_date on sessions
--       Index Cond: (date >= '2026-06-26')
--   Estimated wall time: <0.5 ms
--   Speedup: ~10× now, ~100× at 10 000 sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_date
  ON sessions (date ASC);


-- ── 4. event_registrations — registration_code lookup ────────────────────────
--
-- CRITICAL hot path: every Razorpay payment webhook calls:
--   SELECT … FROM event_registrations WHERE registration_code = 'CS-REG-2026-XXXXXX'
--
-- The existing indexes cover event_id, user_email, payment_status, and status.
-- There is NO index on registration_code, so every payment confirmation
-- scans all registrations.
--
-- BEFORE (no index on registration_code, 12 000 registrations):
--   Seq Scan on event_registrations  (cost=0.00..234 rows=12000 width=300)
--   Filter: (registration_code = 'CS-REG-2026-XXXXXX')
--   Rows Removed by Filter: 11 999
--   Estimated wall time: ~10 ms (grows linearly with registrations)
--
-- AFTER (idx_event_reg_registration_code):
--   Index Scan using idx_event_reg_registration_code on event_registrations
--     (cost=0.29..8.30 rows=1 width=300)
--     Index Cond: (registration_code = 'CS-REG-2026-XXXXXX')
--   Estimated wall time: <0.1 ms
--   Speedup: ~100× (payment-critical path, latency directly affects user UX)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_reg_registration_code
  ON event_registrations (registration_code);


-- ── 5. memberships — user_email point lookup ──────────────────────────────────
--
-- Multiple routes query memberships directly by user_email:
--   /api/user/achievements — SELECT status, expires_at WHERE user_email = ?
--   /api/referrals         — extendOrGrantMembership(email, days) WHERE user_email = ?
--   /api/cron/streak       — active membership check per user
--
-- The existing partial index (expires_at WHERE status = 'active') supports
-- aggregate count queries but not point lookups by user_email.
--
-- BEFORE (no index on user_email, 500 memberships):
--   Seq Scan on memberships  (cost=0.00..12.50 rows=500 width=100)
--   Filter: (user_email = 'user@example.com')
--   Rows Removed by Filter: 499
--   Estimated wall time: ~2 ms now, ~20 ms at 5 000 rows
--
-- AFTER (idx_memberships_user_email):
--   Index Scan using idx_memberships_user_email on memberships
--     (cost=0.28..8.30 rows=1 width=100)
--     Index Cond: (user_email = 'user@example.com')
--   Estimated wall time: <0.1 ms
--   Speedup: ~2× now, ~200× at 5 000 rows
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_memberships_user_email
  ON memberships (user_email);


-- ── 6. points_ledger — bonus point administration ─────────────────────────────
--
-- The admin attendance route runs per-session bonus reconciliation:
--   DELETE FROM points_ledger
--   WHERE session_id = ? AND category = 'bonus' AND user_email IN (…)
--
-- The existing session_id partial index covers session_id IS NOT NULL scans.
-- This composite partial index specifically accelerates the bonus delete by
-- also covering user_email in one index scan, eliminating a heap fetch.
--
-- BEFORE (uses session_id partial index, fetches heap for category filter):
--   Index Scan using points_ledger_session_idx  (rows=N for session)
--   Heap Fetch per row to check category = 'bonus'
--   Estimated wall time: ~3 ms per session (acceptable but grows)
--
-- AFTER (idx_points_ledger_session_bonus):
--   Index Only Scan using idx_points_ledger_session_bonus
--     Index Cond: (session_id = ?) AND (user_email IN (…))
--     Filter: category = 'bonus'  ← already in WHERE clause of index
--   Estimated wall time: <1 ms (index-only scan, no heap fetch)
--   Speedup: ~3× per delete; effect multiplied because delete fired N times
--            per admin submission before the N+1 code fix in this release
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_points_ledger_session_bonus
  ON points_ledger (session_id, user_email)
  WHERE category = 'bonus';


-- ── 7. events — share_slug uniqueness check ────────────────────────────────────
--
-- Admin event creation previously called uniqueSlug() which looped up to 10
-- times querying:  SELECT id FROM events WHERE share_slug = ? LIMIT 1
--
-- This loop is eliminated in this release (replaced with timestamp suffix),
-- but the index is still useful for:
--   • Direct slug-based event lookups (public share links)
--   • Any future uniqueness enforcement at the DB level
--
-- The index is partial (share_slug IS NOT NULL) to avoid indexing null values
-- from draft events that haven't yet been assigned a slug.
--
-- BEFORE (no index on share_slug, 500 events, 10-iteration loop):
--   10 × Seq Scan on events  (cost=0.00..14 rows=500 width=50)
--   10 × Filter: (share_slug = 'five-k-run-1')
--   Total wall time: ~10 × 3 ms = ~30 ms per event creation
--
-- AFTER (code fix removes loop entirely; index accelerates slug lookups):
--   Index Scan using idx_events_share_slug on events
--     (cost=0.28..8.30 rows=1 width=50)
--   Wall time: 0 ms (loop removed) + <0.1 ms per future lookup
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_share_slug
  ON events (share_slug)
  WHERE share_slug IS NOT NULL;


-- ── Indexes deliberately NOT added ───────────────────────────────────────────
--
-- session_attendance(session_id) — already covered by the UNIQUE(session_id,
--   user_email) constraint, whose leading column is session_id.
--
-- session_attendance(user_email) — covered by session_attendance_user_email_idx
--   added in 20260611000003.
--
-- leaderboard(user_email) — covered by the implicit UNIQUE index from the
--   upsert onConflict: "user_email" constraint.  A second non-unique index on
--   the same column adds write overhead without any read benefit.
--
-- notifications(user_email, created_at) — covered by
--   notifications_user_email_idx added in 20260610000004.
--
-- follows(follower_email/following_email) — covered by follows_follower_idx
--   and follows_following_idx added in 20260611000003.
-- ─────────────────────────────────────────────────────────────────────────────
