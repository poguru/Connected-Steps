-- Allow a single account/email to create multiple independent registrations
-- for the same event (e.g. registering self then separately registering friends).
--
-- Previously: UNIQUE(event_id, user_email) enforced one registration per email per event.
-- Now:        Each registration is uniquely identified by registration_code (TEXT UNIQUE).
--             Capacity is enforced by reserve_event_slot() / check_event_capacity() which
--             count confirmed rows and non-expired pending_payment rows — unaffected.
--             Razorpay payment idempotency is enforced by the unique index on
--             razorpay_payment_id — unaffected.
--
-- To reverse: ALTER TABLE public.event_registrations
--               ADD CONSTRAINT event_registrations_event_id_user_email_key
--               UNIQUE (event_id, user_email);
--   (Only safe if no duplicate (event_id, user_email) pairs exist in the table.)

ALTER TABLE public.event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_event_id_user_email_key;
