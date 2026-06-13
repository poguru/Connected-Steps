-- Phase 2: Atomic slot enforcement for events.
-- Adds participant_count to events, maintained by triggers on event_registrations.
-- The BEFORE trigger does a locked capacity check; the AFTER trigger updates the count.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS participant_count integer NOT NULL DEFAULT 0;

-- Back-fill from existing confirmed registrations
UPDATE public.events e
SET participant_count = (
  SELECT COUNT(*)
  FROM public.event_registrations r
  WHERE r.event_id = e.id
    AND r.status = 'confirmed'
);

-- ── BEFORE trigger: atomically enforce capacity ───────────────────────────────
-- Fires before a row is confirmed (INSERT with status=confirmed, or UPDATE to
-- status=confirmed). Locks the events row to prevent concurrent over-booking.

CREATE OR REPLACE FUNCTION public.check_event_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max   integer;
  v_count integer;
BEGIN
  -- Only gate when status is transitioning to 'confirmed'
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed') THEN
    SELECT max_participants, participant_count
      INTO v_max, v_count
      FROM public.events
     WHERE id = NEW.event_id
       FOR UPDATE;  -- row-level lock ensures no concurrent over-booking

    IF v_max IS NOT NULL AND v_count >= v_max THEN
      RAISE EXCEPTION 'Event is fully booked' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_event_capacity ON public.event_registrations;
CREATE TRIGGER trg_check_event_capacity
  BEFORE INSERT OR UPDATE OF status ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.check_event_capacity();

-- ── AFTER trigger: keep participant_count in sync ─────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_participant_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      UPDATE public.events SET participant_count = participant_count + 1 WHERE id = NEW.event_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'confirmed' AND NEW.status = 'confirmed' THEN
      UPDATE public.events SET participant_count = participant_count + 1 WHERE id = NEW.event_id;
    ELSIF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
      UPDATE public.events SET participant_count = GREATEST(0, participant_count - 1) WHERE id = NEW.event_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      UPDATE public.events SET participant_count = GREATEST(0, participant_count - 1) WHERE id = OLD.event_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_participant_count ON public.event_registrations;
CREATE TRIGGER trg_sync_participant_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.sync_participant_count();
