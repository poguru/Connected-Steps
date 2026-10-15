-- ============================================================
-- Migration 20261016000001 — Atomic claim against duplicate registrations
--
-- A registration claims its runners (event, lead email, the runners' phone numbers) in one statement before any
-- seat or discount is held. A second request for the same runners while the first claim is still fresh
-- (15 minutes, the payment hold) fails the insert. Two requests that arrive at the same moment cannot both win.
--
-- Claims are not removed after a successful registration: they only block a repeat for the 15-minute window,
-- as before. A failed registration removes its own claim.
--
-- Additive and idempotent. Not yet applied: needs review and explicit approval before it runs on any database.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.it_run_registration_claims (
  event_id    UUID        NOT NULL REFERENCES public.it_run_events(id),
  lead_email  TEXT        NOT NULL,
  fingerprint TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, lead_email, fingerprint)
);

ALTER TABLE public.it_run_registration_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "it_run_registration_claims_no_direct_access" ON public.it_run_registration_claims;
CREATE POLICY "it_run_registration_claims_no_direct_access" ON public.it_run_registration_claims FOR ALL USING (false);

-- Returns true when this request holds the claim. Returns false when a claim for the same runners is still fresh.
-- The single INSERT ... ON CONFLICT statement is what makes this atomic.
CREATE OR REPLACE FUNCTION public.itr_claim_registration(
  p_event_id    UUID,
  p_lead_email  TEXT,
  p_fingerprint TEXT,
  p_window_mins INTEGER DEFAULT 15
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claimed BOOLEAN;
BEGIN
  INSERT INTO public.it_run_registration_claims (event_id, lead_email, fingerprint, created_at)
  VALUES (p_event_id, p_lead_email, p_fingerprint, now())
  ON CONFLICT (event_id, lead_email, fingerprint) DO UPDATE
    SET created_at = now()
    WHERE public.it_run_registration_claims.created_at <= now() - (p_window_mins * INTERVAL '1 minute')
  RETURNING true INTO v_claimed;
  RETURN COALESCE(v_claimed, false);
END;
$$;

-- Removes this request's claim when its registration did not go ahead.
CREATE OR REPLACE FUNCTION public.itr_release_claim(
  p_event_id    UUID,
  p_lead_email  TEXT,
  p_fingerprint TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.it_run_registration_claims
  WHERE event_id = p_event_id
    AND lead_email = p_lead_email
    AND fingerprint = p_fingerprint;
END;
$$;
