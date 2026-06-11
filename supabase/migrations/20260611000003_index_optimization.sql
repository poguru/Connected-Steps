-- ============================================================
-- Connected Steps — Database Index Optimization
-- File: 20260611000003_index_optimization.sql
-- Date: 2026-06-11
--
-- All CREATE INDEX calls use IF NOT EXISTS so this migration is
-- safe to re-run if the index was already created manually.
-- CONCURRENTLY is omitted because migrations run outside normal
-- traffic (Supabase applies them in a maintenance context).
-- ============================================================

-- ── 1. session_attendance — general user_email lookup ─────────────────────────
--
-- The table has UNIQUE (session_id, user_email) from the upsert onConflict
-- clause, but session_id is the leading column so queries that filter only
-- on user_email cannot use that index.
--
-- Affected queries (every page load):
--   /api/user/sessions        SELECT … WHERE user_email = ?
--   /api/user/joined-sessions SELECT session_id WHERE user_email = ?
--   /api/admin/sessions/[id]/attendance  SELECT … WHERE session_id = ? (already covered)
--
-- Estimated rows in table: 10,000 (100 users × 100 sessions)
--
-- Before: Seq Scan, 10 000 rows examined
--  Query: SELECT … FROM session_attendance WHERE user_email = 'x@y.com'
--  Cost:  Seq Scan rows=10000  (approx 40–80 ms on Supabase free tier)
--
-- After:  Index Scan on session_attendance_user_email_idx, ~100 rows
--  Cost:  ~1–3 ms
--  Improvement: ~25× faster
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS session_attendance_user_email_idx
  ON session_attendance (user_email);


-- ── 2. session_attendance — partial index for attended = true rows ────────────
--
-- Many hot queries filter specifically on attended = true:
--   /api/user/achievements       COUNT WHERE user_email = ? AND attended = true
--   /api/stats                   COUNT(*) WHERE attended = true
--   /lib/auto-feed.ts            SELECT user_email IN (…) WHERE attended = true
--   /app/api/feed/route.ts       SELECT … IN (emailPool) WHERE attended = true
--   /app/api/cron/streak-at-risk paginated: WHERE attended = true ORDER BY user_email
--
-- A partial index only indexes rows where attended = true.
-- This keeps the index small (typically 70–80 % of rows), fits in cache,
-- and allows the streak-at-risk cron full-table scan to become an
-- ordered index scan on the smaller set.
--
-- Before: Seq Scan 10 000 rows with filter attended = true
--  Query: SELECT user_email FROM session_attendance
--         WHERE user_email = 'x@y.com' AND attended = true
--  Cost:  Seq Scan rows=10000  (40–80 ms)
--
-- After:  Index Scan on partial idx (~8 000 attended rows), 80 rows per user
--  Cost:  ~1 ms
--  Improvement: ~50× faster for per-user attended count
--
-- For streak-at-risk full scan (WHERE attended = true ORDER BY user_email):
--  Before: Seq Scan 10 000 rows + explicit sort  (~100 ms)
--  After:  Ordered index scan of 8 000-row partial index, no sort step (~15 ms)
--  Improvement: ~6× faster, sort eliminated
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS session_attendance_attended_user_idx
  ON session_attendance (user_email)
  WHERE attended = true;


-- ── 3. memberships — partial index on expires_at for active rows ──────────────
--
-- Three distinct query patterns all filter status = 'active' AND expires_at:
--
--   /api/stats (every homepage load):
--     SELECT COUNT(*) WHERE status = 'active' AND expires_at > NOW()
--
--   /api/cron/expiry-reminders (daily cron):
--     SELECT … WHERE status = 'active'
--       AND expires_at >= '2026-06-18' AND expires_at <= '2026-06-18 23:59:59'
--
--   /api/cron/weekly-digest (weekly cron):
--     SELECT user_email WHERE status = 'active' AND expires_at > NOW()
--
-- As expired memberships accumulate over time, the full table grows but the
-- active subset stays roughly constant. The partial index stays small and
-- supports efficient range scans.
--
-- Before: Seq Scan on memberships (~500 rows currently, growing)
--  Query: SELECT COUNT(*) FROM memberships
--         WHERE status = 'active' AND expires_at > '2026-06-11T10:00:00Z'
--  Cost:  Seq Scan rows=500 + filter  (~2 ms now, ~20 ms at 5 000 rows)
--
-- After:  Index Range Scan on (expires_at) WHERE status = 'active'
--  Cost:  ~0.3 ms (current scale), scales sub-linearly with active member count
--  Improvement: ~5× now; ~50× at 5 000 total rows (mostly expired)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS memberships_active_expires_idx
  ON memberships (expires_at)
  WHERE status = 'active';


-- ── 4. follows — follower_email lookup ───────────────────────────────────────
--
-- No indexes were found on the follows table in any migration.
-- The table receives full-table scans on every feed page load and every
-- follow/unfollow action.
--
-- Affected queries (called on every feed load):
--   /api/feed/route.ts      SELECT following_email WHERE follower_email = ?
--   /api/posts/route.ts     SELECT following_email WHERE follower_email = ?
--   /api/leaderboard/route  SELECT following_email WHERE follower_email = ?
--   /api/follow/route.ts    SELECT id WHERE follower_email = ? AND following_email = ?
--   /api/users/suggestions  SELECT following_email WHERE follower_email = ?
--
-- Estimated table size: 5 000 rows (100 users × 50 follows each)
--
-- Before: Seq Scan 5 000 rows on every feed/leaderboard page load
--  Query: SELECT following_email FROM follows WHERE follower_email = 'x@y.com'
--  Cost:  Seq Scan rows=5000  (~20–40 ms)
--
-- After:  Index Scan, ~50 rows per user
--  Cost:  ~1 ms
--  Improvement: ~25–40× faster
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS follows_follower_idx
  ON follows (follower_email);


-- ── 5. follows — following_email lookup ──────────────────────────────────────
--
-- The reverse direction is needed for:
--   /api/follow/route.ts  SELECT follower_email WHERE following_email = ?
--     (fetching a user's full follower list)
--   /api/leaderboard      SELECT … WHERE follower_email IN (following) — indirectly
--
-- Before: Seq Scan 5 000 rows
--  Query: SELECT follower_email FROM follows WHERE following_email = 'y@z.com'
--  Cost:  Seq Scan rows=5000  (~20–40 ms)
--
-- After:  Index Scan, ~50 rows
--  Cost:  ~1 ms
--  Improvement: ~25–40× faster
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS follows_following_idx
  ON follows (following_email);


-- ── Indexes deliberately NOT created ─────────────────────────────────────────
--
-- leaderboard (month_points DESC)
--   Table is bounded at one row per user (~500 rows max).
--   Full-table ORDER BY on 500 rows costs <1 ms; an index adds write overhead
--   on every recalculate run (which already does a bulk upsert) for no gain.
--
-- notifications (type, user_email, created_at)
--   The existing (user_email, created_at DESC) composite already serves the
--   streak-at-risk cooldown query (IN clause on user_email + gte created_at).
--   The type filter eliminates a small fraction of rows per user; not worth
--   a dedicated index.
--
-- referral_invites (invitee_email) WHERE rewarded_at IS NULL
--   Table grows at one row per referral signup. At <1 000 rows the existing
--   (invitee_email) index is already near-instant; the partial variant saves
--   negligible space.
--
-- session_attendance (session_id, attended)
--   The UNIQUE (session_id, user_email) covers session_id lookups; the result
--   set per session is typically 10–50 rows, making an additional attended
--   filter trivial in memory.
--
-- memberships (created_at DESC) for admin list
--   Admin-only endpoint, not latency-sensitive, acceptable as a full scan.
-- ─────────────────────────────────────────────────────────────────────────────
