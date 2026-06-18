-- QR code tokens for session attendance
CREATE TABLE IF NOT EXISTS session_qr_codes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token       UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT
);

ALTER TABLE session_qr_codes ENABLE ROW LEVEL SECURITY;

-- Service role (used by API routes) bypasses RLS automatically.
-- Authenticated users need read access to validate tokens during scanning.
CREATE POLICY "Anyone can read qr codes for scanning"
  ON session_qr_codes FOR SELECT USING (true);

CREATE POLICY "Service role can manage qr codes"
  ON session_qr_codes FOR ALL USING (true);

-- Add check-in tracking columns to session_attendance
ALTER TABLE session_attendance
  ADD COLUMN IF NOT EXISTS check_in_time   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_method TEXT DEFAULT 'manual';
