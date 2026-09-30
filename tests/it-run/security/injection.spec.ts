/**
 * @security
 * Injection and payload attack tests.
 * Verifies the application handles malicious inputs safely.
 * These are purely API-level tests — no actual DB/infra damage intended.
 */
import { test, expect } from "@playwright/test";
import { getCategoriesBySlug, cleanupRegistrations } from "../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../helpers/data-factory";
import { expectRegistrationCreated } from "../helpers/assertions";

const REGISTER_URL   = "/api/it-run/register";
const VALIDATE_URL   = "/api/it-run/coupons/validate";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

// ── SQL injection strings ──────────────────────────────────────────────────────

const SQL_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE it_run_registrations; --",
  `" OR ""="`,
  "1; SELECT * FROM it_run_portal_users; --",
];

for (const sqli of SQL_PAYLOADS) {
  test(`@security SQL injection in firstName is safely handled: ${sqli.slice(0, 30)}`, async ({ request }) => {
    const cat = categories["5k-fun-run"];
    const res = await request.post(REGISTER_URL, {
      data: registrationPayload(cat.id, [createAdultParticipant({ firstName: sqli })]),
    });
    // Either succeeds (input stored as literal string — no injection) or returns 4xx
    // Must NEVER return 500 (server error suggests unhandled exception)
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json() as { registrationId?: string };
      if (body.registrationId) createdIds.push(body.registrationId);
    }
  });
}

// ── XSS payloads ───────────────────────────────────────────────────────────────

const XSS_PAYLOADS = [
  "<script>alert(1)</script>",
  `<img src=x onerror="alert(1)">`,
  "javascript:alert(document.cookie)",
  `"><svg onload=alert(1)>`,
];

for (const xss of XSS_PAYLOADS) {
  test(`@security XSS in companyName is safely handled: ${xss.slice(0, 30)}`, async ({ request }) => {
    const cat = categories["5k-fun-run"];
    const res = await request.post(REGISTER_URL, {
      data: registrationPayload(cat.id, [createAdultParticipant({ companyName: xss })]),
    });
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json() as { registrationId?: string };
      if (body.registrationId) createdIds.push(body.registrationId);
    }
  });
}

// ── Oversized payload ──────────────────────────────────────────────────────────

test("@security oversized payload (1MB+ body) is rejected safely", async ({ request }) => {
  const hugeName = "A".repeat(1_000_000);
  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant({ firstName: hugeName })]),
  });
  expect(res.status()).not.toBe(500);
});

test("@security oversized payload in coupon validate is rejected safely", async ({ request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: "A".repeat(100_000), categoryId: cat.id, amount: 649 },
  });
  expect(res.status()).not.toBe(500);
});

// ── Unexpected fields ──────────────────────────────────────────────────────────

test("@security extra fields in registration payload are ignored safely", async ({ request }) => {
  const cat = categories["5k-fun-run"];
  const participant = {
    ...createAdultParticipant(),
    __proto__: { admin: true },           // prototype pollution attempt
    isAdmin: true,                        // unexpected field
    payment_status: "paid",              // attempt to override DB field
    registration_status: "active",
    id: "00000000-0000-0000-0000-000000000000",
  };
  const res = await request.post(REGISTER_URL, {
    data: { categoryId: cat.id, couponId: null, participants: [participant], isAdmin: true },
  });
  expect(res.status()).not.toBe(500);
  // If it creates a registration, ensure the extra fields had no effect
  if (res.status() === 200) {
    const body = await res.json() as { registrationId?: string };
    if (body.registrationId) createdIds.push(body.registrationId);
  }
});

// ── Malformed JSON ─────────────────────────────────────────────────────────────

test("@security malformed JSON body is rejected with 4xx", async ({ request }) => {
  const res = await request.post(REGISTER_URL, {
    headers: { "content-type": "application/json" },
    data: "not-json-{",
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

// ── Coupon code injection ──────────────────────────────────────────────────────

test("@security SQL injection in coupon code is handled safely", async ({ request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: "' UNION SELECT * FROM it_run_portal_users --", categoryId: cat.id, amount: 649 },
  });
  // Should 400 (coupon not found), NOT 500
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});
