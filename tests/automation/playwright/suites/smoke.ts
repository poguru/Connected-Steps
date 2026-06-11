/**
 * SMOKE SUITE
 * Must complete in under 10 minutes.
 * Run with: npx playwright test --grep @smoke
 *
 * Add @smoke tag to any test: test("name @smoke", ...)
 * OR use project filter: npx playwright test --project chromium --grep @smoke
 */

export const SMOKE_TESTS = [
  // Auth
  "specs/auth/login.spec.ts::TC-L01",   // valid login
  "specs/auth/signup.spec.ts::TC-SU05", // signup form accessible

  // Dashboard
  "specs/dashboard/dashboard.spec.ts::TC-DASH01", // dashboard loads
  "specs/dashboard/dashboard.spec.ts::TC-DASH05", // mobile responsive

  // Sessions
  "specs/sessions/registration.spec.ts::TC-SR01", // sessions listed

  // Membership
  "specs/membership/membership.spec.ts::TC-MEM01", // membership status
  "specs/membership/membership.spec.ts::TC-MEM04", // pricing page

  // Community
  "specs/community/community.spec.ts::TC-COM01", // community loads

  // Leaderboard
  "specs/leaderboard/leaderboard.spec.ts::TC-LB01", // leaderboard API

  // Security
  "specs/security/security.spec.ts::SEC-01", // 401 on unauthenticated premium
  "specs/security/security.spec.ts::SEC-02", // 401 on admin routes

  // Admin
  "specs/admin/admin.spec.ts::TC-ADM01", // admin sessions loads

  // Coach
  "specs/coach/coach.spec.ts::TC-COACH01", // coaches listed
] as const;
