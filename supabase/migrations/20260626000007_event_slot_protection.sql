-- ============================================================
-- Connected Steps — Event Slot Protection
-- File: 20260626000007_event_slot_protection.sql
--
-- Scenario: 2 000 users attempt to register for an event with 500 slots.
--
-- Existing protection (from 20260613000007_events_participant_count.sql):
--   • BEFORE trigger check_event_capacity() enforces max_participants
--     when status transitions to 'confirmed'.  Uses FOR UPDATE on the
--     events row — fully atomic.  Prevents overselling at confirm time.
--
-- Remaining gap:
--   All 2 000 users can create pending_payment registrations, then all
--   try to pay.  The 501st person pays real money, hits the trigger at
--   verify-payment, gets "fully booked" → needs a refund.
--
-- This migration adds:
--   1. slot_reserved_at / slot_expires_at columns — mark when a slot was
--      reserved so the capacity check can include non-expired pending rows.
--   2. UNIQUE index on razorpay_payment_id — prevents double-processing
--      of the same Razorpay payment (webhook retries, network blips).
--   3. reserve_event_slot() RPC — atomically checks capacity and reserves
--      a slot BEFORE the Razorpay order is created.  Called from
--      /api/events/create-payment-order so users never reach the payment
--      screen for a full event.
--   4. release_expired_slots() RPC — cancels stale pending reservations
--      after the TTL so those slots become available to other users.
-- ============================================================


-- ── 1. Slot reservation columns ───────────────────────────────────────────────
-- slot_reserved_at: set when the user clicks "Pay" (create-payment-order)
-- slot_expires_at:  set to slot_reserved_at + 15 min; reservation lapses if
--                   the user abandons the payment flow.

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS slot_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slot_expires_at  TIMESTAMPTZ;

-- Back-fill for any existing pending rows (treat them as freshly reserved)
UPDATE public.event_registrations
   SET slot_reserved_at = created_at,
       slot_expires_at  = created_at + INTERVAL '15 minutes'
 WHERE status          = 'pending_payment'
   AND slot_reserved_at IS NULL;


-- ── 2. Unique payment ID — prevent duplicate payment processing ───────────────
-- If the Razorpay webhook fires twice, or the client double-submits the
-- verify-payment call, the second UPDATE hits a unique violation (code 23505)
-- which the route handles as an idempotent success.

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_reg_razorpay_payment_id
  ON public.event_registrations (razorpay_payment_id)
 WHERE razorpay_payment_id IS NOT NULL;

-- Index to efficiently find all reserved (non-expired) pending rows per event
CREATE INDEX IF NOT EXISTS idx_event_reg_slot_expiry
  ON public.event_registrations (event_id, slot_expires_at)
 WHERE status = 'pending_payment';


-- ── 3. reserve_event_slot() — atomic slot reservation ────────────────────────
--
-- Called from /api/events/create-payment-order BEFORE the Razorpay order is
-- created.  Acquires a row-level lock on the events row (FOR UPDATE) so that
-- concurrent calls serialize — only one proceeds when the last slot is taken.
--
-- Returns:
--   'reserved'          — slot allocated, order can proceed
--   'already_reserved'  — reservation extended, order can proceed
--   'full'              — no slots left, return 409 to the user

CREATE OR REPLACE FUNCTION public.reserve_event_slot(
  p_registration_id uuid,
  p_event_id        uuid,
  p_ttl_minutes     int DEFAULT 15
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max     integer;
  v_count   bigint;
  v_already boolean;
BEGIN
  -- Fast path: if this registration already has a live reservation, just extend it
  SELECT (slot_reserved_at IS NOT NULL AND slot_expires_at > NOW())
    INTO v_already
    FROM event_registrations
   WHERE id = p_registration_id;

  IF v_already THEN
    UPDATE event_registrations
       SET slot_expires_at = NOW() + (p_ttl_minutes || ' minutes')::interval
     WHERE id = p_registration_id;
    RETURN 'already_reserved';
  END IF;

  -- Lock the event row to serialise concurrent slot checks.
  -- Any other call to reserve_event_slot() for the same event will block here
  -- until this transaction commits, eliminating the race window.
  SELECT max_participants
    INTO v_max
    FROM events
   WHERE id = p_event_id
     FOR UPDATE;

  -- No capacity limit — reserve freely
  IF v_max IS NULL THEN
    UPDATE event_registrations
       SET slot_reserved_at = NOW(),
           slot_expires_at  = NOW() + (p_ttl_minutes || ' minutes')::interval
     WHERE id = p_registration_id;
    RETURN 'reserved';
  END IF;

  -- Count slots already taken: confirmed rows + non-expired pending reservations
  -- (excluding this registration so a retry doesn't block itself)
  SELECT COUNT(*)
    INTO v_count
    FROM event_registrations
   WHERE event_id = p_event_id
     AND id      <> p_registration_id
     AND (
           status = 'confirmed'
           OR (
                status           = 'pending_payment'
                AND slot_reserved_at IS NOT NULL
                AND slot_expires_at  >  NOW()
              )
         );

  IF v_count >= v_max THEN
    RETURN 'full';
  END IF;

  -- Claim the slot
  UPDATE event_registrations
     SET slot_reserved_at = NOW(),
         slot_expires_at  = NOW() + (p_ttl_minutes || ' minutes')::interval
   WHERE id = p_registration_id;

  RETURN 'reserved';
END;
$$;

GRANT  EXECUTE ON FUNCTION public.reserve_event_slot(uuid, uuid, int) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reserve_event_slot(uuid, uuid, int) FROM PUBLIC;


-- ── 4. release_expired_slots() — reclaim abandoned reservations ───────────────
--
-- Marks timed-out pending_payment registrations as 'cancelled' so their slots
-- are available for the next buyer.  Called by the daily job-worker cron or
-- manually from admin.  Idempotent — safe to run multiple times.

CREATE OR REPLACE FUNCTION public.release_expired_slots()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released int;
BEGIN
  UPDATE event_registrations
     SET status         = 'cancelled',
         payment_status = 'expired'
   WHERE status         = 'pending_payment'
     AND slot_expires_at < NOW()
     AND slot_reserved_at IS NOT NULL;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.release_expired_slots() TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_expired_slots() FROM PUBLIC;
