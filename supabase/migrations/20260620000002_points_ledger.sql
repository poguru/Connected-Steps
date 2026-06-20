-- points_ledger: immutable event log of every point award
-- Attendance points are written on QR scan.
-- Bonus points are written when admin saves session results.
-- Rows are never deleted — only inserted (or bonus rows replaced on re-save).

CREATE TABLE IF NOT EXISTS public.points_ledger (
  id          BIGSERIAL    PRIMARY KEY,
  user_email  TEXT         NOT NULL,
  session_id  UUID         REFERENCES public.sessions(id) ON DELETE SET NULL,
  points      INTEGER      NOT NULL,
  reason      TEXT         NOT NULL,
  category    TEXT         NOT NULL CHECK (category IN ('attendance', 'bonus', 'streak')),
  awarded_by  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS points_ledger_email_idx   ON public.points_ledger (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS points_ledger_session_idx ON public.points_ledger (session_id) WHERE session_id IS NOT NULL;

-- RLS: service role only — same pattern as audit_logs
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger via the API (x-user-token) — NOT direct DB access
-- No INSERT/UPDATE/DELETE policies → client JS can never write directly
