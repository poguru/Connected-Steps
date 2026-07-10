-- Extend points_ledger to support challenge, referral, strava, and admin_adjustment categories.
-- The original CHECK only had 'attendance', 'bonus', 'streak'.

ALTER TABLE public.points_ledger DROP CONSTRAINT IF EXISTS points_ledger_category_check;
ALTER TABLE public.points_ledger
  ADD CONSTRAINT points_ledger_category_check
  CHECK (category IN ('attendance', 'bonus', 'streak', 'challenge', 'referral', 'strava', 'admin_adjustment'));

-- Optional metadata blob for challenge_id links, referral codes, etc.
ALTER TABLE public.points_ledger ADD COLUMN IF NOT EXISTS metadata JSONB;

-- session_challenges: one row per challenge award given after a session.
-- The admin picks a challenge type, a winner from attendees, and a points value.
-- Points are written here AND to points_ledger (category='challenge') so
-- recalculateMonth() picks them up automatically.

CREATE TABLE IF NOT EXISTS public.session_challenges (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID         NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_email     TEXT         NOT NULL,
  challenge_type TEXT         NOT NULL,
  challenge_name TEXT         NOT NULL,
  points         INTEGER      NOT NULL DEFAULT 10 CHECK (points > 0),
  awarded_by     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_challenges_session_idx ON public.session_challenges (session_id);
CREATE INDEX IF NOT EXISTS session_challenges_email_idx   ON public.session_challenges (user_email, created_at DESC);

ALTER TABLE public.session_challenges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_challenges' AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all" ON public.session_challenges FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_challenges' AND policyname = 'admin_read'
  ) THEN
    EXECUTE $p$CREATE POLICY "admin_read" ON public.session_challenges
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.users
        WHERE email = auth.email() AND role IN ('admin', 'coach')
      ))$p$;
  END IF;
END $$;
