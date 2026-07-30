-- Fix daily_attendance_qr unique constraint.
--
-- BUG: The original constraint `UNIQUE NULLS NOT DISTINCT (date, location_id)` enforces
-- exactly one row per (date, location_id) ever — including deactivated historical rows.
-- This means the deactivate-then-insert regeneration pattern fails on the second attempt:
-- the old row (now is_active = false) still holds the unique slot.
--
-- FIX: Replace with a partial unique index that only covers active rows.
-- Multiple historical rows per day are now allowed (is_active = false);
-- only one active row per (date, location_id) is enforced.

ALTER TABLE public.daily_attendance_qr
  DROP CONSTRAINT IF EXISTS daily_attendance_qr_date_location_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_attendance_qr_active_slot
  ON public.daily_attendance_qr (date, location_id)
  NULLS NOT DISTINCT
  WHERE is_active = TRUE;
