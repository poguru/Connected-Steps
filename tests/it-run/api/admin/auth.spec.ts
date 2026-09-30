/**
 * @admin
 * Admin portal authentication tests.
 * POST /api/it-run/portal/auth — login
 * GET  /api/it-run/portal/auth — verify session
 * DELETE /api/it-run/portal/auth — logout
 */
import { test, expect } from "@playwright/test";

const AUTH_URL = "/api/it-run/portal/auth";

// ── Login happy path ───────────────────────────────────────────────────────────

test("@admin @smoke valid admin login returns role and name", async ({ request }) => {
  const email    = process.env.ITR_TEST_ADMIN_EMAIL ?? "";
  const password = process.env.ITR_TEST_ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    test.skip(true, "ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD not set");
    return;
  }

  const res = await request.post(AUTH_URL, { data: { email, password } });
  expect(res.status()).toBe(200);
  const body = await res.json() as { ok: boolean; role: string; name: string };
  expect(body.ok).toBe(true);
  expect(body.role).toBeTruthy();
  expect(body.name).toBeTruthy();

  // Cookie must be set
  const setCookie = res.headers()["set-cookie"] ?? "";
  expect(setCookie).toContain("it_run_portal_session");
  expect(setCookie).toContain("HttpOnly");
});

// ── Login failure paths ────────────────────────────────────────────────────────

test("@admin wrong password returns 401", async ({ request }) => {
  const email = process.env.ITR_TEST_ADMIN_EMAIL ?? "admin@example.com";
  const res = await request.post(AUTH_URL, {
    data: { email, password: "WRONG_PASSWORD_123!" },
  });
  expect(res.status()).toBe(401);
});

test("@admin unknown email returns 401", async ({ request }) => {
  const res = await request.post(AUTH_URL, {
    data: { email: "nobody@nowhere.test", password: "anything" },
  });
  expect(res.status()).toBe(401);
});

test("@admin missing email returns 4xx", async ({ request }) => {
  const res = await request.post(AUTH_URL, {
    data: { password: "anything" },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test("@admin missing password returns 4xx", async ({ request }) => {
  const res = await request.post(AUTH_URL, {
    data: { email: "admin@example.com" },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

// ── Session verification ───────────────────────────────────────────────────────

test("@admin GET session without cookie returns 401", async ({ request }) => {
  const res = await request.get(AUTH_URL);
  expect(res.status()).toBe(401);
});

test("@admin GET session with invalid cookie returns 401", async ({ request }) => {
  const res = await request.get(AUTH_URL, {
    headers: { Cookie: "it_run_portal_session=invalid.session.value" },
  });
  expect(res.status()).toBe(401);
});

test("@admin GET session with tampered cookie returns 401", async ({ request }) => {
  // HMAC-signed cookie — tampering the payload invalidates the sig
  const tampered = Buffer.from(JSON.stringify({ email: "admin@x.com", role: "super_admin", exp: 9999999999 })).toString("base64url") + ".invalidsig";
  const res = await request.get(AUTH_URL, {
    headers: { Cookie: `it_run_portal_session=${tampered}` },
  });
  expect(res.status()).toBe(401);
});

// ── Logout ─────────────────────────────────────────────────────────────────────

test("@admin DELETE (logout) clears session cookie", async ({ request }) => {
  const res = await request.delete(AUTH_URL);
  expect(res.status()).toBe(200);
  const setCookie = res.headers()["set-cookie"] ?? "";
  // Cookie should be cleared (maxAge=0 or expires in past)
  expect(setCookie).toContain("it_run_portal_session");
  expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=.*\b19\d\d\b/);
});

// ── Admin endpoints without session ───────────────────────────────────────────

test("@admin dashboard returns 401 without session", async ({ request }) => {
  const res = await request.get("/api/it-run/admin/dashboard");
  expect(res.status()).toBe(401);
});

test("@admin registrations returns 401 without session", async ({ request }) => {
  const res = await request.get("/api/it-run/admin/registrations");
  expect(res.status()).toBe(401);
});

test("@admin participants returns 401 without session", async ({ request }) => {
  const res = await request.get("/api/it-run/admin/participants");
  expect(res.status()).toBe(401);
});
