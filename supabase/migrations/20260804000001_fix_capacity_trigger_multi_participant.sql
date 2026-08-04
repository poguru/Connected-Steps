-- Fix: participant_count trigger and capacity check both used `1` per registration row.
-- For multi-participant bookings (duo, family, group), this undercounted by N-1 per booking,
-- allowing overbooking. Both functions now use event_registrations.participant_count (which
-- defaults to 1 for single-person bookings, preserving existing behaviour).

-- ── BEFORE trigger: atomically enforce event-level AND per-race capacity ─────

CREATE OR REPLACE FUNCTION public.check_event_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max        integer;
  v_count      integer;
  v_adding     integer;
  v_race_max   integer;
  v_race_count integer;
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed') THEN
    v_adding := COALESCE(NEW.participant_count, 1);

    -- Lock the events row to serialise concurrent confirmations
    SELECT max_participants, participant_count
      INTO v_max, v_count
      FROM public.events
     WHERE id = NEW.event_id
       FOR UPDATE;

    -- Event-level capacity check
    IF v_max IS NOT NULL AND v_count + v_adding > v_max THEN
      RAISE EXCEPTION 'Event is fully booked' USING ERRCODE = 'P0001';
    END IF;

    -- Per-race (category) capacity check
    -- The FOR UPDATE on events above serialises registrations, so this count is consistent.
    IF NEW.distance_category IS NOT NULL THEN
      SELECT max_slots INTO v_race_max
        FROM public.event_races
       WHERE event_id = NEW.event_id
         AND name = NEW.distance_category;

      IF v_race_max IS NOT NULL THEN
        SELECT COALESCE(SUM(COALESCE(r.participant_count, 1)), 0) INTO v_race_count
          FROM public.event_registrations r
         WHERE r.event_id = NEW.event_id
           AND r.distance_category = NEW.distance_category
           AND r.status = 'confirmed'
           AND r.id <> NEW.id;  -- exclude self so UPDATE does not double-count

        IF v_race_count + v_adding > v_race_max THEN
          RAISE EXCEPTION 'This category is fully booked' USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── AFTER trigger: keep participant_count in sync (add/subtract actual count) ─

CREATE OR REPLACE FUNCTION public.sync_participant_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      UPDATE public.events
         SET participant_count = participant_count + COALESCE(NEW.participant_count, 1)
       WHERE id = NEW.event_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'confirmed' AND NEW.status = 'confirmed' THEN
      UPDATE public.events
         SET participant_count = participant_count + COALESCE(NEW.participant_count, 1)
       WHERE id = NEW.event_id;
    ELSIF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
      UPDATE public.events
         SET participant_count = GREATEST(0, participant_count - COALESCE(OLD.participant_count, 1))
       WHERE id = NEW.event_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      UPDATE public.events
         SET participant_count = GREATEST(0, participant_count - COALESCE(OLD.participant_count, 1))
       WHERE id = OLD.event_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-backfill participant_count from the actual sum (fixes any drift from
-- multi-participant bookings that were registered before this migration).
UPDATE public.events e
SET participant_count = COALESCE((
  SELECT SUM(COALESCE(r.participant_count, 1))
    FROM public.event_registrations r
   WHERE r.event_id = e.id
     AND r.status = 'confirmed'
), 0);
