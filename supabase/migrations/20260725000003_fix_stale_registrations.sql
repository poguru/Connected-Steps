-- ============================================================
-- Connected Steps — Fix orphaned pending_payment registrations
-- File: 20260725000003_fix_stale_registrations.sql
--
-- Root cause:
--   When all event slots fill up after a user submits the registration
--   form but before they click "Pay", their event_registrations row is
--   created with status='pending_payment' / payment_status='pending'.
--   When create-payment-order calls reserve_event_slot() it returns
--   'full' — so slot_reserved_at and slot_expires_at are NEVER SET.
--
--   release_expired_slots() only cleans up rows where
--   slot_reserved_at IS NOT NULL, so these orphaned rows are never
--   expired and permanently block the user from joining the waitlist.
--
-- This migration:
--   1. One-time recovery: expire all such orphaned rows that are >30 min old
--   2. Update release_expired_slots() to handle this case going forward
-- ============================================================


-- ── 1. One-time recovery ─────────────────────────────────────────────────────
-- Cancel event_participants rows first (FK references registration id)
UPDATE public.event_participants
   SET status = 'cancelled'
 WHERE registration_id IN (
   SELECT id
     FROM public.event_registrations
    WHERE status            = 'pending_payment'
      AND payment_status    = 'pending'
      AND slot_reserved_at  IS NULL
      AND created_at        < NOW() - INTERVAL '30 minutes'
 );

-- Expire the orphaned registration rows.
-- Use 'expired' to match what release_expired_slots() uses for consistency.
UPDATE public.event_registrations
   SET status         = 'cancelled',
       payment_status = 'expired'
 WHERE status            = 'pending_payment'
   AND payment_status    = 'pending'
   AND slot_reserved_at  IS NULL
   AND created_at        < NOW() - INTERVAL '30 minutes';


-- ── 2. Update release_expired_slots() to handle orphaned rows ─────────────────
-- The original function only cleaned up rows where slot_reserved_at IS NOT NULL.
-- The new version also expires orphaned rows (slot never reserved, >30 min old).
CREATE OR REPLACE FUNCTION public.release_expired_slots()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released int := 0;
  v_orphans  int := 0;
BEGIN
  -- Case 1: slot was reserved but the 15-minute TTL has elapsed
  UPDATE event_registrations
     SET status         = 'cancelled',
         payment_status = 'expired'
   WHERE status         = 'pending_payment'
     AND slot_expires_at  < NOW()
     AND slot_reserved_at IS NOT NULL;
  GET DIAGNOSTICS v_released = ROW_COUNT;

  -- Case 2: slot was NEVER reserved (reserve_event_slot returned 'full')
  -- slot_reserved_at stays NULL; clean up after 30 min (2× the slot TTL)
  UPDATE event_registrations
     SET status         = 'cancelled',
         payment_status = 'expired'
   WHERE status            = 'pending_payment'
     AND payment_status    = 'pending'
     AND slot_reserved_at  IS NULL
     AND created_at        < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS v_orphans = ROW_COUNT;

  RETURN v_released + v_orphans;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.release_expired_slots() TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_expired_slots() FROM PUBLIC;
