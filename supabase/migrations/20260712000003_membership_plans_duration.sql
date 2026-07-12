-- Add duration_months to membership_plans so the payment flow can read
-- billing period from the DB instead of maintaining a hardcoded lookup.
-- Also adds a partial unique index to prevent duplicate active plans
-- for the same Razorpay payment key.

ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS duration_months integer;

-- Populate from the existing razorpay_plan keys.
UPDATE membership_plans SET duration_months =  1 WHERE razorpay_plan = 'monthly';
UPDATE membership_plans SET duration_months =  3 WHERE razorpay_plan = 'quarterly';
UPDATE membership_plans SET duration_months =  6 WHERE razorpay_plan = 'biannual';
UPDATE membership_plans SET duration_months = 12 WHERE razorpay_plan = 'annual';

-- Enforce one-active-plan-per-payment-key to prevent ambiguous lookups in
-- create-order and verify. Null razorpay_plan rows (contact-only plans) are
-- excluded because they never go through the payment flow.
CREATE UNIQUE INDEX IF NOT EXISTS membership_plans_razorpay_plan_active_unique
  ON membership_plans (razorpay_plan)
  WHERE razorpay_plan IS NOT NULL AND is_active = true;
