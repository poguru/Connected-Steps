-- Fix negative/zero early_bird_price values that should have been NULL.
-- A value of <= 0 is semantically invalid (free events use price=0, not early_bird_price=0)
-- and caused the public event page to display "₹-1" and allowed free registrations
-- for paid events when early_bird_ends_at was set.

UPDATE event_races
SET early_bird_price = NULL
WHERE early_bird_price IS NOT NULL AND early_bird_price <= 0;
