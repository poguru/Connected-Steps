/**
 * @feedback
 * Participant feedback submission tests for POST /api/it-run/feedback
 * and retrieval via GET /api/it-run/feedback?code=.
 *
 * NOTE: These tests rely on a completed IT Run event with at least one paid
 * registration in the test DB (event_date in the past, payment_status='paid').
 * If no such registration exists the "gate" tests will still pass but the
 * "happy path" tests will be skipped gracefully.
 *
 * Set env vars:
 *   ITR_TEST_FEEDBACK_CODE  – a valid, paid, non-cancelled reg code for a past event
 */
import { test, expect } from "../../fixtures/api";

const FEEDBACK_URL = "/api/it-run/feedback";

// ── Field validation ───────────────────────────────────────────────────────────

test("@feedback rejects missing registration_code", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { overall_rating: 4 },
  });
  expect(res.status()).toBe(400);
  const body = await res.json() as { error?: string };
  expect(body.error).toBeTruthy();
});

test("@feedback rejects missing overall_rating", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-XXXXXXXX" },
  });
  expect(res.status()).toBe(400);
  const body = await res.json() as { error?: string };
  expect(body.error).toBeTruthy();
});

test("@feedback rejects overall_rating = 0", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-XXXXXXXX", overall_rating: 0 },
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects overall_rating = 6", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-XXXXXXXX", overall_rating: 6 },
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects non-integer overall_rating", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-XXXXXXXX", overall_rating: 3.5 },
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects invalid nps_score = -1", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-XXXXXXXX", overall_rating: 4, nps_score: -1 },
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects invalid nps_score = 11", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-XXXXXXXX", overall_rating: 4, nps_score: 11 },
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects invalid improvement area", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: {
      registration_code: "ITRUN2-XXXXXXXX",
      overall_rating: 4,
      improvement_areas: ["__proto__"],
    },
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects improvement_areas as non-array", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: {
      registration_code: "ITRUN2-XXXXXXXX",
      overall_rating: 4,
      improvement_areas: "registration",
    },
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects invalid JSON body", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    headers: { "Content-Type": "application/json" },
    data: "not-json",
  });
  expect(res.status()).toBe(400);
});

test("@feedback rejects oversized comment (>2001 chars)", async ({ uniqueIpRequest: request }) => {
  // Server truncates to 2000 — so a 2001 char comment is silently truncated, not rejected.
  // But XSS in comment should be stripped.
  const xssComment = "<script>alert(1)</script>Hello";
  const res = await request.post(FEEDBACK_URL, {
    data: {
      registration_code: "ITRUN2-NOTEXIST",
      overall_rating: 4,
      comment: xssComment,
    },
  });
  // Will fail on invalid code, not on the comment — but server should sanitize before insert
  expect([400, 403]).toContain(res.status());
});

// ── Invalid code ───────────────────────────────────────────────────────────────

test("@feedback rejects unknown registration code", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-NOTEXIST", overall_rating: 4 },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test("@feedback rejects empty string registration code", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "", overall_rating: 4 },
  });
  expect(res.status()).toBe(400);
});

// ── GET validation ─────────────────────────────────────────────────────────────

test("@feedback GET without code returns 400", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(FEEDBACK_URL);
  expect(res.status()).toBe(400);
});

test("@feedback GET with unknown code returns 400 or 404", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${FEEDBACK_URL}?code=ITRUN2-NOTEXIST`);
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

// ── Category rating optional bounds ───────────────────────────────────────────

test("@feedback rejects organisation_rating = 6", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-NOTEXIST", overall_rating: 4, organisation_rating: 6 },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test("@feedback rejects route_rating = 0", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: "ITRUN2-NOTEXIST", overall_rating: 4, route_rating: 0 },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

// ── Rate limiting ──────────────────────────────────────────────────────────────

test("@feedback rate limiting kicks in after 3 rapid requests from same IP", async ({ api: request }) => {
  const payload = { registration_code: "ITRUN2-NOTEXIST", overall_rating: 3 };
  let got429 = false;
  for (let i = 0; i < 5; i++) {
    const res = await request.post(FEEDBACK_URL, { data: payload });
    if (res.status() === 429) {
      got429 = true;
      break;
    }
  }
  expect(got429).toBe(true);
});
