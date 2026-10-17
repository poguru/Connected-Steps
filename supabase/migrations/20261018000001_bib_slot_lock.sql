-- ============================================================
-- Migration 20261018000001 — Lock a confirmed BIB collection slot
--
-- Replaces itr_book_bib_slot so that two requests from the same runner cannot both succeed:
--   * the runner's participant row is locked first, so concurrent requests for one runner run one after the other;
--   * a runner with a confirmed booking gets 'already_booked' and nothing changes (no slot overwrite, no capacity);
--   * capacity is counted only when a booking row was really inserted or re-confirmed (never for an already-confirmed one);
--   * a participant that does not exist returns 'participant_not_found' instead of booking anything.
--
-- Unchanged: the slot row lock, the capacity check, the return values for full and slot_not_found, and the function
-- signature. Re-running this is safe (CREATE OR REPLACE).
--
-- Not yet applied: needs review and explicit approval before it is run in any environment.
-- ============================================================

CREATE OR REPLACE FUNCTION itr_book_bib_slot(
  p_participant_id UUID,
  p_slot_id        UUID
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_slot      RECORD;
  v_existing  UUID;
  v_booking   UUID;
BEGIN
  -- Serialise every request for this runner. A second request waits here until the first has committed.
  PERFORM 1 FROM it_run_participants WHERE id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'participant_not_found';
  END IF;

  -- A confirmed booking is final: never replaced here
  SELECT id INTO v_existing
  FROM it_run_bib_bookings
  WHERE participant_id = p_participant_id AND status = 'confirmed';

  IF v_existing IS NOT NULL THEN
    RETURN 'already_booked';
  END IF;

  -- Lock and check capacity
  SELECT id, capacity, booked_count INTO v_slot
  FROM it_run_bib_slots
  WHERE id = p_slot_id AND is_active = true
  FOR UPDATE;

  IF v_slot IS NULL THEN
    RETURN 'slot_not_found';
  END IF;

  IF v_slot.booked_count >= v_slot.capacity THEN
    RETURN 'full';
  END IF;

  -- Insert, or re-confirm a cancelled booking. A confirmed row is never updated here.
  INSERT INTO it_run_bib_bookings (participant_id, slot_id, status)
  VALUES (p_participant_id, p_slot_id, 'confirmed')
  ON CONFLICT (participant_id) DO UPDATE
    SET slot_id = EXCLUDED.slot_id, status = 'confirmed'
    WHERE it_run_bib_bookings.status <> 'confirmed'
  RETURNING id INTO v_booking;

  IF v_booking IS NULL THEN
    -- The row was already confirmed (a concurrent request won): nothing is booked or counted here
    RETURN 'already_booked';
  END IF;

  UPDATE it_run_bib_slots
  SET booked_count = booked_count + 1
  WHERE id = p_slot_id;

  RETURN 'confirmed';
END;
$$;
