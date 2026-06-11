import { ENV } from "./env";

export const USERS = {
  standard: {
    email:     ENV.TEST_EMAIL,
    password:  ENV.TEST_PASSWORD,
    firstName: "QA",
    lastName:  "User",
  },
  secondary: {
    email:     ENV.TEST_EMAIL_2,
    password:  ENV.TEST_PASSWORD,
    firstName: "QA",
    lastName:  "User2",
  },
  admin: {
    password: ENV.ADMIN_PASSWORD,
  },
} as const;

export const PLANS = {
  monthly:    { id: "monthly",    label: "Monthly",    amount: 999 },
  quarterly:  { id: "quarterly",  label: "Quarterly",  amount: 2499 },
  biannual:   { id: "biannual",   label: "Biannual",   amount: 4499 },
  annual:     { id: "annual",     label: "Annual",     amount: 7999 },
} as const;

export const ROUTES = {
  home:        "/",
  auth:        "/auth",
  signIn:      "/auth?tab=signin",
  signUp:      "/auth?tab=signup",
  dashboard:   "/dashboard",
  profile:     "/profile",
  sessions:    "/sessions",
  leaderboard: "/leaderboard",
  achievements:"/achievements",
  community:   "/community",
  feed:        "/feed",
  pricing:     "/pricing",
  payments:    "/payments",
  myQuestions: "/my-questions",
  coaches:     "/coaches",
  admin:       "/admin",
  adminLogin:  "/admin/login",
  notifications:"/notifications",
  referrals:   "/referrals",
  welcome:     "/welcome",
} as const;

export const TIMEOUTS = {
  short:      5_000,
  standard:  15_000,
  long:      30_000,
  payment:   60_000,
} as const;

export const xssPayloads = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  "javascript:alert(1)",
];

export function uniqueEmail(prefix = "qa") {
  return `${prefix}+${Date.now()}@connectedsteps.test`;
}

export function futureDate(daysAhead = 1) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export function pastDate(daysAgo = 1) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
