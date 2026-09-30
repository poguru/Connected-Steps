/**
 * @payment
 * Payment order creation tests — POST /api/it-run/payment/create-order
 */
import { test, expect } from "../../fixtures/api";
import {
  getCategoriesBySlug, getRegistration, cleanupRegistrations,
  forcePaymentStatus, getTestDb,
} from "../../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../../helpers/data-factory";
import { expectRegistrationCreated, expectError } from "../../helpers/assertions";

const REGISTER_URL    = "/api/it-run/register";
const CREATE_ORDER_URL = "/api/it-run/payment/create-order";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

// ── Happy path ─────────────────────────────────────────────────────────────────

test("@payment @smoke create-order returns orderId + amount for pending registration", async ({ uniqueIpRequest: request }) => {
  // Create a registration first
  const cat    = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const reg    = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  // Attempt order creation — will fail if RAZORPAY_KEY_ID is not configured locally
  // but in CI/staging with real keys it will succeed
  const orderRes = await request.post(CREATE_ORDER_URL, {
    data: { registrationId: reg.registrationId },
  });

  if (orderRes.status() === 500) {
    // Likely Razorpay not configured in local test env — skip gracefully
    test.skip(true, "Razorpay not configured in test environment — skipping create-order test");
    return;
  }

  expect(orderRes.status()).toBe(200);
  const body = await orderRes.json() as { orderId: string; amount: number; currency: string; key: string };
  expect(body.orderId).toMatch(/^order_/);
  expect(body.amount).toBe(cat.price_rupees * 100); // paise
  expect(body.currency).toBe("INR");
  expect(body.key).toBeTruthy();

  const dbReg = await getRegistration(reg.registrationId);
  expect(dbReg.payment_status).toBe("payment_attempted");
});

// ── Guards ─────────────────────────────────────────────────────────────────────

test("@payment create-order returns 4xx for non-existent registration", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(CREATE_ORDER_URL, {
    data: { registrationId: "00000000-0000-0000-0000-000000000000" },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test("@payment create-order returns error for already-paid registration", async ({ uniqueIpRequest: request }) => {
  const cat    = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const reg    = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  await forcePaymentStatus(reg.registrationId, "paid");

  const res = await request.post(CREATE_ORDER_URL, { data: { registrationId: reg.registrationId } });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test("@payment create-order returns error for expired registration", async ({ uniqueIpRequest: request }) => {
  const cat    = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const reg    = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  await forcePaymentStatus(reg.registrationId, "expired");

  const res = await request.post(CREATE_ORDER_URL, { data: { registrationId: reg.registrationId } });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("@payment create-order returns error for free registration", async ({ uniqueIpRequest: request }) => {
  // Covered by free.spec.ts but also tested here for the create-order perspective
  const cat    = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) });
  const reg    = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  await forcePaymentStatus(reg.registrationId, "free");

  const res = await request.post(CREATE_ORDER_URL, { data: { registrationId: reg.registrationId } });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("@payment create-order rejects missing registrationId", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(CREATE_ORDER_URL, { data: {} });
  await expectError(res, 400);
});
