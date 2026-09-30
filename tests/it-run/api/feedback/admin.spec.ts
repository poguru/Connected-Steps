/**
 * @feedback @admin
 * Admin feedback API tests:
 *   GET    /api/it-run/admin/feedback          (list)
 *   PATCH  /api/it-run/admin/feedback          (moderation)
 *   GET    /api/it-run/admin/feedback/summary  (analytics)
 *   GET    /api/it-run/admin/feedback/export   (CSV)
 *
 * Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD env vars.
 * If no feedback rows exist for the test event, list/summary tests still
 * pass with empty results.
 */
import { test, expect } from "../../fixtures/api";
import { getSprintEvent } from "../../fixtures/db";

const LIST_URL    = "/api/it-run/admin/feedback";
const SUMMARY_URL = "/api/it-run/admin/feedback/summary";
const EXPORT_URL  = "/api/it-run/admin/feedback/export";

let eventId: string;

test.beforeAll(async () => {
  const event = await getSprintEvent();
  if (!event) throw new Error("sprint-2 event not found — run migrations first");
  eventId = event.id;
});

// ── Unauthenticated access blocked ────────────────────────────────────────────

test("@feedback @admin list blocked without admin session", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${LIST_URL}?event_id=${eventId}`);
  expect(res.status()).toBe(401);
});

test("@feedback @admin summary blocked without admin session", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${SUMMARY_URL}?event_id=${eventId}`);
  expect(res.status()).toBe(401);
});

test("@feedback @admin export blocked without admin session", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${EXPORT_URL}?event_id=${eventId}`);
  expect(res.status()).toBe(401);
});

test("@feedback @admin PATCH blocked without admin session", async ({ uniqueIpRequest: request }) => {
  const res = await request.patch(LIST_URL, {
    data: { id: "00000000-0000-0000-0000-000000000000", is_flagged: true },
  });
  expect(res.status()).toBe(401);
});

// ── Authenticated — list ───────────────────────────────────────────────────────

test("@feedback @admin list returns paginated response", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(LIST_URL, { event_id: eventId });
  expect(res.status()).toBe(200);
  const body = await res.json() as { feedback: unknown[]; total: number; page: number; per_page: number };
  expect(Array.isArray(body.feedback)).toBe(true);
  expect(typeof body.total).toBe("number");
  expect(body.page).toBe(0);
  expect(body.per_page).toBeGreaterThan(0);
});

test("@feedback @admin list requires event_id param", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(LIST_URL);
  expect(res.status()).toBe(400);
});

test("@feedback @admin list with invalid event_id returns 404", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(LIST_URL, { event_id: "00000000-0000-0000-0000-000000000000" });
  expect(res.status()).toBe(404);
});

test("@feedback @admin list per_page capped at 200", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(LIST_URL, { event_id: eventId, per_page: "9999" });
  expect(res.status()).toBe(200);
  const body = await res.json() as { per_page: number };
  expect(body.per_page).toBeLessThanOrEqual(200);
});

// ── Authenticated — summary ────────────────────────────────────────────────────

test("@feedback @admin summary returns expected shape", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(SUMMARY_URL, { event_id: eventId });
  expect(res.status()).toBe(200);
  const body = await res.json() as Record<string, unknown>;
  expect(typeof body.total_responses).toBe("number");
  expect(typeof body.avg_overall).toBe("number");
  expect(Array.isArray(body.rating_distribution)).toBe(true);
});

test("@feedback @admin summary requires event_id", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(SUMMARY_URL);
  expect(res.status()).toBe(400);
});

// ── Authenticated — export ─────────────────────────────────────────────────────

test("@feedback @admin export returns CSV content-type", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(EXPORT_URL, { event_id: eventId });
  expect(res.status()).toBe(200);
  const ct = res.headers()["content-type"] ?? "";
  expect(ct).toContain("text/csv");
});

test("@feedback @admin export has content-disposition attachment header", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(EXPORT_URL, { event_id: eventId });
  const cd = res.headers()["content-disposition"] ?? "";
  expect(cd).toContain("attachment");
  expect(cd).toContain("feedback-");
});

test("@feedback @admin export requires event_id", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.get(EXPORT_URL);
  expect(res.status()).toBe(400);
});

// ── PATCH moderation ───────────────────────────────────────────────────────────

test("@feedback @admin PATCH rejects missing id", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.patch(LIST_URL, { is_flagged: true });
  expect(res.status()).toBe(400);
});

test("@feedback @admin PATCH rejects invalid issue_status", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.patch(LIST_URL, {
    id: "00000000-0000-0000-0000-000000000000",
    issue_status: "invalid_status",
  });
  expect(res.status()).toBe(400);
});

test("@feedback @admin PATCH rejects invalid issue_priority", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.patch(LIST_URL, {
    id: "00000000-0000-0000-0000-000000000000",
    issue_priority: "urgent",
  });
  expect(res.status()).toBe(400);
});

test("@feedback @admin PATCH returns 404 for non-existent feedback id", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.patch(LIST_URL, {
    id: "00000000-0000-0000-0000-000000000000",
    is_flagged: true,
  });
  expect(res.status()).toBe(404);
});

test("@feedback @admin PATCH rejects no fields to update", async ({ adminApi }) => {
  await adminApi.login();
  const res = await adminApi.patch(LIST_URL, {
    id: "00000000-0000-0000-0000-000000000000",
  });
  expect(res.status()).toBe(400);
});
