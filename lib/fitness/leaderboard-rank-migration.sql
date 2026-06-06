-- ── Leaderboard rank tracking migration ──────────────────────────────────────
-- Run in Supabase SQL Editor > New Query

-- 1. Add week_points (computed each time the leaderboard is fetched)
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS week_points int NOT NULL DEFAULT 0;

-- 2. Add previous rank snapshots for movement indicators
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS prev_month_rank int;
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS prev_week_rank  int;

-- 3. Snapshot current month ranks into prev_month_rank
--    Run this once now to initialise, then run weekly to rotate.
WITH ranked AS (
  SELECT user_email,
         ROW_NUMBER() OVER (ORDER BY month_points DESC) AS rn
  FROM leaderboard
)
UPDATE leaderboard l
SET prev_month_rank = r.rn
FROM ranked r
WHERE l.user_email = r.user_email
  AND l.prev_month_rank IS NULL;
