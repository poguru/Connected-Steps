-- Fix users who were created through the event-register flow with phone = ''
-- (empty string). This happened because complete-event-verify used "" as a
-- NOT NULL guard, which caused UNIQUE violations for every phone-less user
-- after the first. NULL is semantically correct for "no phone provided" and
-- PostgreSQL UNIQUE allows multiple NULLs.
--
-- Prerequisite: migration 20260813000001 must be applied first (makes phone nullable).
-- Safe to re-run: UPDATE with no matching rows is a no-op.

UPDATE public.users
SET    phone = NULL
WHERE  phone = '';
