-- Keeps event_races.slot_reserved in sync with confirmed registrations.
--
-- A slot is "reserved" when the registration is confirmed (status='confirmed')
-- and the payment is settled (payment_status IN ('paid','free')).
-- The trigger fires AFTER INSERT / UPDATE / DELETE on event_registrations.
--
-- Also backfills slot_reserved for any existing rows so current events
-- immediately reflect accurate capacity data.

-- ── Trigger function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_race_slot_reserved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_distance  TEXT;
  v_race_id   UUID;
  v_delta     INT;
  v_was_confirmed BOOLEAN;
  v_is_confirmed  BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
    v_distance  := OLD.distance_category;
    v_was_confirmed := (OLD.status = 'confirmed' AND OLD.payment_status IN ('paid', 'free'));
    IF v_was_confirmed THEN v_delta := -1; ELSE RETURN OLD; END IF;

  ELSIF TG_OP = 'INSERT' THEN
    v_event_id := NEW.event_id;
    v_distance  := NEW.distance_category;
    v_is_confirmed := (NEW.status = 'confirmed' AND NEW.payment_status IN ('paid', 'free'));
    IF v_is_confirmed THEN v_delta := 1; ELSE RETURN NEW; END IF;

  ELSE -- UPDATE
    v_event_id := NEW.event_id;
    v_distance  := COALESCE(NEW.distance_category, OLD.distance_category);
    v_was_confirmed := (OLD.status = 'confirmed' AND OLD.payment_status IN ('paid', 'free'));
    v_is_confirmed  := (NEW.status = 'confirmed' AND NEW.payment_status IN ('paid', 'free'));
    IF v_was_confirmed = v_is_confirmed THEN
      -- No change in confirmed status; nothing to do
      RETURN NEW;
    END IF;
    v_delta := CASE WHEN v_is_confirmed THEN 1 ELSE -1 END;
  END IF;

  -- Resolve race by (event_id, distance)
  IF v_distance IS NOT NULL THEN
    SELECT id INTO v_race_id
      FROM public.event_races
     WHERE event_id = v_event_id
       AND distance = v_distance
     LIMIT 1;

    IF v_race_id IS NOT NULL THEN
      UPDATE public.event_races
         SET slot_reserved = GREATEST(0, COALESCE(slot_reserved, 0) + v_delta)
       WHERE id = v_race_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_race_slot_reserved ON public.event_registrations;
CREATE TRIGGER trg_sync_race_slot_reserved
  AFTER INSERT OR UPDATE OR DELETE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.sync_race_slot_reserved();

-- ── Backfill: recompute slot_reserved from current registrations ───────────────

UPDATE public.event_races r
   SET slot_reserved = (
     SELECT COUNT(*)
       FROM public.event_registrations er
      WHERE er.event_id          = r.event_id
        AND er.distance_category = r.distance
        AND er.status            = 'confirmed'
        AND er.payment_status   IN ('paid', 'free')
   )
 WHERE r.max_slots IS NOT NULL;  -- Only races that actually enforce a cap matter

NOTIFY pgrst, 'reload schema';
