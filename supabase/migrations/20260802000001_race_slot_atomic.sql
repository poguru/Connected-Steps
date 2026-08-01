-- Phase 4 Part 1: Atomic per-race slot enforcement
--
-- The existing check_event_capacity() trigger atomically enforces event-level
-- max_participants (20260613000007) using FOR UPDATE on the events row.
--
-- Gap: per-race max_slots is only checked at the application layer with a
-- non-atomic count query. Two concurrent free registrations can both pass
-- the count check and both write status='confirmed', exceeding the slot limit.
--
-- Fix: BEFORE trigger check_race_capacity() locks the event_races row FOR UPDATE
-- when a registration transitions to status='confirmed', counts existing confirmed
-- rows for that distance_category, and raises P0001 if the limit is reached.
-- The lock serialises concurrent registrations at the race level and the BEFORE
-- trigger fires inside the same transaction as the upsert, closing the gap.

CREATE OR REPLACE FUNCTION public.check_race_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_slots integer;
  v_count     bigint;
BEGIN
  -- Only enforce when a row is being confirmed for the first time
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed') THEN

    -- No distance category on this registration → no per-race limit applies
    IF NEW.distance_category IS NULL THEN
      RETURN NEW;
    END IF;

    -- Lock the race row for this event + category.
    -- Any concurrent call for the same race blocks here until this transaction
    -- commits, eliminating the read-check-write race at the application layer.
    SELECT max_slots
      INTO v_max_slots
      FROM event_races
     WHERE event_id = NEW.event_id
       AND distance = NEW.distance_category
       AND status   = 'active'
       FOR UPDATE;

    -- No matching race row or no slot limit configured → allow
    IF v_max_slots IS NULL OR v_max_slots = 0 THEN
      RETURN NEW;
    END IF;

    -- Count confirmed registrations for this event + category.
    -- In a BEFORE trigger the current row is not yet written, so this
    -- accurately excludes the incoming row.
    SELECT COUNT(*)
      INTO v_count
      FROM event_registrations
     WHERE event_id          = NEW.event_id
       AND distance_category = NEW.distance_category
       AND status            = 'confirmed';

    IF v_count >= v_max_slots THEN
      RAISE EXCEPTION 'Race category is fully booked' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_race_capacity ON public.event_registrations;
CREATE TRIGGER trg_check_race_capacity
  BEFORE INSERT OR UPDATE OF status ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.check_race_capacity();
