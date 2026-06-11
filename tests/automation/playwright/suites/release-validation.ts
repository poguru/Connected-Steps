/**
 * RELEASE VALIDATION SUITE
 * Run before every deployment. Must pass 100%.
 * Covers all CRITICAL business paths.
 *
 * Run: npx playwright test --grep @release
 */

export const RELEASE_VALIDATION_TESTS = [
  // ── Authentication ──────────────────────────────────────────────────────
  "specs/auth/login.spec.ts::TC-L01",         // login works
  "specs/auth/login.spec.ts::TC-L08",         // logout works
  "specs/auth/login.spec.ts::TC-L07",         // rate limiting
  "specs/auth/otp.spec.ts::TC-OTP01",         // OTP rate limited
  "specs/auth/otp.spec.ts::TC-OTP03",         // OTP replay blocked
  "specs/auth/signup.spec.ts::TC-SU02",       // duplicate email rejected

  // ── Sessions ────────────────────────────────────────────────────────────
  "specs/sessions/registration.spec.ts::TC-SR02", // join increments RSVP
  "specs/sessions/registration.spec.ts::TC-SR03", // leave removes record
  "specs/sessions/registration.spec.ts::TC-SR06", // blocked after 2h

  // ── Membership ──────────────────────────────────────────────────────────
  "specs/membership/membership.spec.ts::TC-MEM07", // payment sig tamper
  "specs/membership/membership.spec.ts::TC-MEM09", // unauthenticated = 401
  "specs/membership/membership.spec.ts::TC-MEM02", // expired blocks premium

  // ── Community ───────────────────────────────────────────────────────────
  "specs/community/community.spec.ts::TC-COM03",   // unapproved post hidden
  "specs/community/community.spec.ts::TC-COM04",   // XSS sanitised

  // ── Security ────────────────────────────────────────────────────────────
  "specs/security/security.spec.ts::SEC-01",        // 401 not 403 on unauth
  "specs/security/security.spec.ts::SEC-03",        // cron needs secret
  "specs/security/security.spec.ts::SEC-04",        // payment sig rejected
  "specs/security/security.spec.ts::SEC-05",        // OTP rate limited
  "specs/security/security.spec.ts::SEC-06",        // login rate limited
  "specs/security/security.spec.ts::SEC-11",        // deactivated user blocked

  // ── Leaderboard ─────────────────────────────────────────────────────────
  "specs/leaderboard/leaderboard.spec.ts::TC-LB06", // recalc idempotent
  "specs/leaderboard/leaderboard.spec.ts::TC-LB08", // cron needs auth

  // ── Admin ────────────────────────────────────────────────────────────────
  "specs/admin/admin.spec.ts::TC-ADM04",   // sync idempotent
  "specs/admin/admin.spec.ts::TC-ADM08",   // recalculate needs admin auth

  // ── Coach ────────────────────────────────────────────────────────────────
  "specs/coach/coach.spec.ts::TC-COACH03", // free user blocked
  "specs/coach/coach.spec.ts::TC-COACH05", // training plan 403
] as const;
