-- ── Phase 6: Enhance event_comm_history ──────────────────────────────────────
-- Adds channel and recipient_filter columns for multi-channel communication tracking.
-- The existing `filter` column is kept for backward compatibility.

ALTER TABLE public.event_comm_history
  ADD COLUMN IF NOT EXISTS channel          TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS recipient_filter TEXT,
  ADD COLUMN IF NOT EXISTS body             TEXT;

-- Backfill recipient_filter from the existing filter column
UPDATE public.event_comm_history
   SET recipient_filter = filter
 WHERE recipient_filter IS NULL AND filter IS NOT NULL;
