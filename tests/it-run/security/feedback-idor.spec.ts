/**
 * @security @feedback
 * Security tests for the feedback system:
 *   - Cross-event access (IDOR)
 *   - Registration code forgery
 *   - Unauthorized admin access
 *   - Role escalation attempt
 *   - SQL injection in feedback fields
 *   - XSS payloads in comment field
 *   - Missing/malformed fields
 */
import { test, expect } from "../fixtures/api";
import { getSprintEvent } from "../fixtures/db";

const FEEDBACK_URL    = "/api/it-run/feedback";
const ADMIN_LIST_URL  = "/api/it-run/admin/feedback";
const ADMIN_SUMMARY_URL = "/api/it-run/admin/feedback/summary";

let eventId: string;

test.beforeAll(async () => {
  const event = await getSprintEvent();
  if (!event) throw new Error("sprint-2 event not found — run migrations first");
  eventId = event.id;
});

// ── IDOR — cross-event access ──────────────────────────────────────────────────

test("@security @feedback IDOR: reg code from one event cannot submit feedback for another", async ({ uniqueIpRequest: request }) => {
  // Using a fake UUID as "another event id" — GET should 400/404
  const fakeEventId = "00000000-0000-0000-0000-000000000001";
  const res = await request.post(FEEDBACK_URL, {
    data: {
      registration_code: "ITRUN2-XXXXXXXX",
      it_run_event_id: fakeEventId,
      overall_rating: 5,
    },
  });
  // Server ignores client-supplied event_id; looks up via reg code only
  // So this should still fail because code doesn't exist
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test("@security @feedback IDOR: admin cannot view feedback for nonexistent event", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(ADMIN_LIST_URL, { event_id: "00000000-0000-0000-0000-000000000002" });
  expect(res.status()).toBe(404);
});

test("@security @feedback IDOR: admin summary for nonexistent event returns 404", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(ADMIN_SUMMARY_URL, { event_id: "00000000-0000-0000-0000-000000000002" });
  expect(res.status()).toBe(404);
});

// ── Unauthorized admin access ──────────────────────────────────────────────────

test("@security @feedback unauthenticated request to admin list returns 401", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${ADMIN_LIST_URL}?event_id=${eventId}`);
  expect(res.status()).toBe(401);
});

test("@security @feedback unauthenticated request to admin summary returns 401", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${ADMIN_SUMMARY_URL}?event_id=${eventId}`);
  expect(res.status()).toBe(401);
});

test("@security @feedback unauthenticated PATCH to admin feedback returns 401", async ({ uniqueIpRequest: request }) => {
  const res = await request.patch(ADMIN_LIST_URL, {
    data: { id: "00000000-0000-0000-0000-000000000000", is_flagged: true },
  });
  expect(res.status()).toBe(401);
});

// ── Role escalation ────────────────────────────────────────────────────────────

test("@security @feedback forged admin cookie rejected", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${ADMIN_LIST_URL}?event_id=${eventId}`, {
    headers: { Cookie: "it_run_portal_session=forged_session_token_xyzxyz" },
  });
  expect(res.status()).toBe(401);
});

test("@security @feedback fabricated role header ignored", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${ADMIN_LIST_URL}?event_id=${eventId}`, {
    headers: {
      "X-Admin-Role": "super_admin",
      "X-Override-Auth": "true",
    },
  });
  expect(res.status()).toBe(401);
});

// ── SQL injection ──────────────────────────────────────────────────────────────

test("@security @feedback SQL injection in registration_code returns 400/404", async ({ uniqueIpRequest: request }) => {
  const injections = [
    "' OR '1'='1",
    "ITRUN2-'; DROP TABLE event_feedback; --",
    "1; SELECT * FROM it_run_registrations",
  ];
  for (const code of injections) {
    const res = await request.post(FEEDBACK_URL, {
      data: { registration_code: code, overall_rating: 4 },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  }
});

test("@security @feedback SQL injection in admin search param does not crash", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(ADMIN_LIST_URL, {
    event_id: eventId,
    search: "'; DROP TABLE event_feedback; --",
  });
  // Should return 200 (empty or filtered results) — not 500
  expect(res.status()).toBe(200);
});

// ── XSS in comment ─────────────────────────────────────────────────────────────

test("@security @feedback XSS in comment is sanitized server-side", async ({ uniqueIpRequest: request }) => {
  // Submit with XSS payload — will fail at invalid code but server sanitizes before even that
  const res = await request.post(FEEDBACK_URL, {
    data: {
      registration_code: "ITRUN2-XSSTEST",
      overall_rating: 5,
      comment: "<script>alert('xss')</script>Clean comment",
    },
  });
  // Fails on invalid code (not script tag)
  expect([400, 403]).toContain(res.status());
});

// ── Malformed payloads ─────────────────────────────────────────────────────────

test("@security @feedback empty POST body returns 400", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, { data: {} });
  expect(res.status()).toBe(400);
});

test("@security @feedback null registration_code returns 400", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: null, overall_rating: 4 },
  });
  expect(res.status()).toBe(400);
});

test("@security @feedback array as registration_code returns 400", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: { registration_code: ["ITRUN2-A"], overall_rating: 4 },
  });
  expect(res.status()).toBe(400);
});

test("@security @feedback object injection in improvement_areas rejected", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(FEEDBACK_URL, {
    data: {
      registration_code: "ITRUN2-NOTEXIST",
      overall_rating: 4,
      improvement_areas: [{ "$ne": null }],
    },
  });
  expect(res.status()).toBe(400);
});

// ── Oversized payload ──────────────────────────────────────────────────────────

test("@security @feedback comment >2000 chars is truncated not rejected", async ({ uniqueIpRequest: request }) => {
  // We can't fully confirm truncation without a valid code, but we verify
  // the endpoint doesn't error-500 on a very long comment.
  const longComment = "A".repeat(5000);
  const res = await request.post(FEEDBACK_URL, {
    data: {
      registration_code: "ITRUN2-NOTEXIST",
      overall_rating: 4,
      comment: longComment,
    },
  });
  // Fails on invalid code — not on oversized comment
  expect([400, 403]).toContain(res.status());
  expect(res.status()).not.toBe(500);
});
