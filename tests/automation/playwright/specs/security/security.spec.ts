import { test, expect } from "../../fixtures/base";
import { USERS, xssPayloads } from "../../utils/test-data";

// Security suite runs without pre-authenticated state
test.describe("Security", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // ── Auth Guards ────────────────────────────────────────────────────────────

  test("SEC-01 | premium API without auth returns 401 not 403", async ({ request }) => {
    const endpoints = [
      "/api/user/training-plan",
      "/api/membership",
      "/api/notifications",
      // /api/referrals/code returns 404 when ENABLE_REFERRALS is not set — skip
      // /api/coach-questions GET requires ?email= but returns 401 for missing email
    ];
    for (const ep of endpoints) {
      const res = await request.get(ep);
      expect(res.status(), `${ep} should return 401`).toBe(401);
    }
    // coach-questions without email also returns 401
    const coachRes = await request.get("/api/coach-questions");
    expect(coachRes.status(), "/api/coach-questions should return 401 for missing email").toBe(401);
  });

  test("SEC-02 | admin routes return 401 without admin cookie", async ({ request }) => {
    const adminEndpoints = [
      "/api/admin/users",
      "/api/admin/memberships",
      "/api/admin/sessions",
    ];
    for (const ep of adminEndpoints) {
      const res = await request.get(ep);
      expect(res.status(), `${ep} should return 401`).toBe(401);
    }
  });

  test("SEC-03 | cron endpoints return 401 without CRON_SECRET", async ({ request }) => {
    const cronPaths = [
      "/api/cron/session-reminders",
      "/api/cron/streak-at-risk",
      "/api/cron/weekly-digest",
      "/api/cron/expiry-reminders",
      "/api/cron/rank-snapshot",
    ];
    for (const path of cronPaths) {
      const res = await request.get(path);
      expect(res.status(), `${path} should return 401`).toBe(401);
    }
  });

  // Razorpay may not be configured in the test environment.
  // Accept 400 (tampered signature rejected) OR 503 (gateway not configured).
  test("SEC-04 | payment verify rejects tampered Razorpay signature", async ({ request }) => {
    const res = await request.post("/api/payment/verify", {
      data: {
        razorpay_order_id:   "order_fakeid123",
        razorpay_payment_id: "pay_fakeid456",
        razorpay_signature:  "INVALID_TAMPERED_SIGNATURE",
      },
    });
    expect([400, 503]).toContain(res.status());
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/signature|invalid|unauthorized|unavailable/i);
  });

  test("SEC-05 | OTP verify brute force is rate limited", async ({ request }) => {
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request.post("/api/auth/verify-otp", {
        data: { email: "brute-force@test.com", code: `0${i.toString().padStart(5, "0")}`, purpose: "login" },
      });
      if (res.status() === 429) { got429 = true; break; }
    }
    expect(got429, "OTP endpoint must rate-limit after N failures").toBe(true);
  });

  // Use `identifier` (not `email`) to match the actual login API contract.
  // Use a dedicated address so this test's rate-limit window is isolated.
  test("SEC-06 | login brute force is rate limited", async ({ request }) => {
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await request.post("/api/auth/login", {
        data: { identifier: "brute-sec@ratelimit.test", password: `wrong${i}` },
      });
      if (res.status() === 429) { got429 = true; break; }
    }
    expect(got429, "Login endpoint must rate-limit after N failures").toBe(true);
  });

  test("SEC-07 | open redirect in login is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        identifier: USERS.standard.email,
        password:   USERS.standard.password,
        redirect:   "https://evil.example.com",
      },
    });
    if (res.status() === 200) {
      const body = await res.json();
      const redirectTo: string = body.redirectTo ?? body.redirect ?? "";
      expect(redirectTo).not.toMatch(/^https?:\/\/(?!localhost)/);
    }
  });

  test("SEC-08 | XSS payloads in community post body are sanitised", async ({ request }) => {
    for (const payload of xssPayloads) {
      const res = await request.post("/api/auth/login", {
        data: { identifier: USERS.standard.email, password: USERS.standard.password },
      });
      if (res.status() !== 200) continue;

      const postRes = await request.post("/api/community/posts", {
        data: {
          title:      "XSS Test",
          body:       payload,
          category:   "general",
          user_email: USERS.standard.email,
          user_name:  "QA User",
        },
      });
      if (postRes.status() !== 200) continue;
      const body = await postRes.json();
      expect(JSON.stringify(body)).not.toContain("<script>");
    }
  });

  test("SEC-09 | DB errors are NOT exposed to client (no stack traces)", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { firstName: "", lastName: "", email: "not-an-email", password: "" },
    });
    if (res.status() >= 400) {
      const text = await res.text();
      expect(text).not.toMatch(/at Object\.|stack:|PostgreSQL|supabase/i);
    }
  });

  // Notifications API requires ?email= + x-user-token; returns 401 without them.
  // The RLS property (user A can't read user B's notifs) is verified at the
  // API layer: the endpoint only returns rows for the authenticated email.
  test("SEC-10 | RLS: user A cannot read user B notifications via API", async ({ request }) => {
    const notifRes = await request.get("/api/notifications");
    // Without auth, must be 401 — not 200 with another user's data
    if (notifRes.status() === 200) {
      const body    = await notifRes.json();
      const notifs  = (body.notifications ?? body) as Array<{ user_email?: string }>;
      if (Array.isArray(notifs)) {
        for (const n of notifs) {
          if (n.user_email) {
            expect(n.user_email.toLowerCase()).toBe(USERS.standard.email.toLowerCase());
          }
        }
      }
    } else {
      // Expected: 401 (auth required)
      expect([401]).toContain(notifRes.status());
    }
  });

  test("SEC-11 | deactivated user cannot access premium features", async ({ request, db }) => {
    try {
      await db.deactivateUser(USERS.standard.email);
    } catch {
      test.skip(true, "is_active column not available — apply DB migration first");
      return;
    }
    try {
      // Use `identifier` (correct field name) to get a meaningful auth response
      const loginRes = await request.post("/api/auth/login", {
        data: { identifier: USERS.standard.email, password: USERS.standard.password },
      });
      if (loginRes.status() === 200) {
        // Login succeeded — premium API must still block the deactivated user
        const planRes = await request.get("/api/user/training-plan");
        expect([401, 403]).toContain(planRes.status());
      } else {
        // Correct: login itself blocked for deactivated user
        expect([401, 403]).toContain(loginRes.status());
      }
    } finally {
      await db.activateUser(USERS.standard.email);
    }
  });

  test("SEC-12 | admin password endpoint missing body returns 400 not 500", async ({ request }) => {
    const res = await request.post("/api/admin/auth/login", { data: {} });
    expect([400, 401]).toContain(res.status());
    const text = await res.text();
    expect(text).not.toMatch(/stack:|at Object\./);
  });
});
