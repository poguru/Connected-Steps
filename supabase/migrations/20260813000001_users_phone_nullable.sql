-- Make users.phone nullable so minimal accounts can be created during event
-- registration using email + name only, without requiring a mobile number.
-- Existing rows are unaffected (they all have phone values already).

ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
