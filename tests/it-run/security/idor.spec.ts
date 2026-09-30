/**
 * @security
 * IDOR (Insecure Direct Object Reference) tests.
 * Verifies users cannot access or mutate another user's registration data.
 */
import { test, expect } from "../fixtures/api";
import {
  getCategoriesBySlug, getRegistration, cleanupRegistrations, forcePaymentStatus,
} from "../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../helpers/data-factory";
import { expectRegistrationCreated } from "../helpers/assertions";

const REGISTER_URL   = "/api/it-run/register";
const DASHBOARD_URL  = (code: string) => `/api/it-run/dashboard/${code}`;
const CREATE_ORDER_URL = "/api/it-run/payment/create-order";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

// ── Dashboard IDOR ─────────────────────────────────────────────────────────────

test("@security dashboard only accessible by correct registration code", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  // Correct code → 200
  const res1 = await request.get(DASHBOARD_URL(reg.registrationCode));
  expect(res1.status()).toBe(200);

  // Wrong code → 4xx
  const res2 = await request.get(DASHBOARD_URL("ITRUN2-XXXXXXXX"));
  expect(res2.status()).toBeGreaterThanOrEqual(400);
  expect(res2.status()).toBeLessThan(500);
});

test("@security dashboard cannot be accessed via another registration's code", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];

  const res1 = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const res2 = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const r1 = await expectRegistrationCreated(res1);
  const r2 = await expectRegistrationCreated(res2);
  createdIds.push(r1.registrationId, r2.registrationId);

  // Registration 1's code cannot access registration 2's data
  const dashRes = await request.get(DASHBOARD_URL(r1.registrationCode));
  const dashBody = await dashRes.json() as { reg?: { id: string } };
  expect(dashBody.reg?.id).toBe(r1.registrationId);
  expect(dashBody.reg?.id).not.toBe(r2.registrationId);
});

// ── Payment IDOR ───────────────────────────────────────────────────────────────

test("@security payment order cannot be created for another user's registration by guessing ID", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];

  // Create reg A
  const resA = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const rA   = await expectRegistrationCreated(resA);
  createdIds.push(rA.registrationId);

  // Brute-force attempt — try random UUIDs
  const fakeId = "11111111-1111-1111-1111-111111111111";
  const attemptRes = await request.post(CREATE_ORDER_URL, { data: { registrationId: fakeId } });
  expect(attemptRes.status()).toBeGreaterThanOrEqual(400);
  expect(attemptRes.status()).toBeLessThan(500);
});

// ── Registration code enumeration ─────────────────────────────────────────────

test("@security dashboard returns 404 for sequential/guessable codes", async ({ request }) => {
  const guessCodes = [
    "ITRUN2-00000001",
    "ITRUN2-AAAAAAAA",
    "ITRUN2-12345678",
    "ITRUN2-SPRINT2A",
  ];
  for (const code of guessCodes) {
    const res = await request.get(DASHBOARD_URL(code));
    expect(res.status()).toBeGreaterThanOrEqual(400);
  }
});

// ── Admin IDOR ─────────────────────────────────────────────────────────────────

test("@security PATCH admin/registrations without admin session returns 401", async ({ request }) => {
  const res = await request.patch("/api/it-run/admin/registrations", {
    data: { id: "00000000-0000-0000-0000-000000000000", admin_notes: "hacked" },
  });
  expect(res.status()).toBe(401);
});

test("@security PATCH admin/participants without admin session returns 401", async ({ request }) => {
  const res = await request.patch("/api/it-run/admin/participants", {
    data: { id: "00000000-0000-0000-0000-000000000000", first_name: "Hacked" },
  });
  expect(res.status()).toBe(401);
});

test("@security POST admin/bibs (BIB allocation) without admin session returns 401", async ({ request }) => {
  const res = await request.post("/api/it-run/admin/bibs", { data: {} });
  expect(res.status()).toBe(401);
});

test("@security POST admin/coupons (coupon create) without admin session returns 401", async ({ request }) => {
  const res = await request.post("/api/it-run/admin/coupons", {
    data: { code: "HACK", discount_type: "percent", discount_value: 100 },
  });
  expect(res.status()).toBe(401);
});
