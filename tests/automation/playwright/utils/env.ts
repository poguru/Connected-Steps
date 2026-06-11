export const ENV = {
  BASE_URL:       process.env.BASE_URL        ?? "http://localhost:3000",
  TEST_EMAIL:     process.env.TEST_EMAIL       ?? "qa-user@connectedsteps.test",
  TEST_PASSWORD:  process.env.TEST_PASSWORD    ?? "QaTest@123",
  TEST_EMAIL_2:   process.env.TEST_EMAIL_2     ?? "qa-user2@connectedsteps.test",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD   ?? "",
  SUPABASE_URL:   process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_KEY:   process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  CRON_SECRET:    process.env.CRON_SECRET      ?? "",
  RAZORPAY_KEY:   process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
} as const;
