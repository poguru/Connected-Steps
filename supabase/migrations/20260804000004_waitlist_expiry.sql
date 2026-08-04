-- ============================================================
-- Waitlist Approval Expiry
-- File: 20260804000004_waitlist_expiry.sql
--
-- Problem: approved waitlist entries have no deadline. A user who is
-- approved but never registers holds a reserved spot indefinitely,
-- blocking the next person in the queue.
--
-- Fix:
--   1. Add approval_expires_at column — 48-hour window by default.
--   2. Extend release_expired_slots() to:
--      a. Expire approved entries whose deadline has passed.
--      b. Auto-promote the next waiting entry for the same event/category.
--   3. Idempotent — safe to run multiple times.
-- ============================================================

-- ── 1. Add expiry column to event_waitlist ────────────────────────────────────
ALTER TABLE public.event_waitlist
  ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ;

-- Back-fill: any existing approved entries that have no expiry get a 48-hour
-- window from their approved_at (or now() if approved_at is missing).
UPDATE public.event_waitlist
   SET approval_expires_at = COALESCE(approved_at, NOW()) + INTERVAL '48 hours'
 WHERE status               = 'approved'
   AND approval_expires_at  IS NULL;

-- Index to efficiently find expired approvals
CREATE INDEX IF NOT EXISTS idx_event_waitlist_approval_expires
  ON public.event_waitlist (event_id, approval_expires_at)
 WHERE status = 'approved';


-- ── 2. Extend release_expired_slots() ────────────────────────────────────────
-- Also expires lapsed waitlist approvals and promotes the next waiting entry.

CREATE OR REPLACE FUNCTION public.release_expired_slots()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released       int := 0;
  v_wl_expired     int := 0;
  v_rec            RECORD;
  v_next_waiting   uuid;
  v_total          int;
BEGIN
  -- ── A. Release stale pending_payment slots ────────────────────────────────
  UPDATE event_registrations
     SET status         = 'cancelled',
         payment_status = 'expired'
   WHERE status         = 'pending_payment'
     AND slot_expires_at < NOW()
     AND slot_reserved_at IS NOT NULL;

  GET DIAGNOSTICS v_released = ROW_COUNT;

  -- ── B. Expire approved waitlist entries whose deadline has passed ──────────
  -- Mark them expired, then auto-promote the next waiting entry for that
  -- event+category combination so the queue keeps moving.

  FOR v_rec IN
    SELECT id, event_id, distance_category
      FROM public.event_waitlist
     WHERE status              = 'approved'
       AND approval_expires_at < NOW()
  LOOP
    -- Expire the lapsed approval
    UPDATE public.event_waitlist
       SET status = 'expired'
     WHERE id = v_rec.id;

    v_wl_expired := v_wl_expired + 1;

    -- Promote the next waiting entry for the same event+category
    SELECT id
      INTO v_next_waiting
      FROM public.event_waitlist
     WHERE event_id          = v_rec.event_id
       AND status            = 'waiting'
       AND (
              (distance_category IS NULL AND v_rec.distance_category IS NULL)
           OR  distance_category = v_rec.distance_category
           )
     ORDER BY position ASC
     LIMIT 1
       FOR UPDATE SKIP LOCKED;

    IF v_next_waiting IS NOT NULL THEN
      UPDATE public.event_waitlist
         SET status              = 'approved',
             approved_at         = NOW(),
             notified_at         = NULL,   -- admin must notify the new entrant
             approval_expires_at = NOW() + INTERVAL '48 hours'
       WHERE id = v_next_waiting;
    END IF;
  END LOOP;

  GET DIAGNOSTICS v_total = ROW_COUNT; -- not meaningful after loop, use counter

  -- Return combined count so callers can log/alert when something changed
  RETURN v_released + v_wl_expired;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.release_expired_slots() TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_expired_slots() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
