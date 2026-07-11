-- Add difficulty rating to sessions for session card UI badges.
-- NULL = unset (badge hidden). Admin sets per session.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS difficulty TEXT
  CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'));

COMMENT ON COLUMN public.sessions.difficulty IS
  'Training difficulty shown on session cards: beginner / intermediate / advanced';
