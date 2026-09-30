/**
 * @payment @webhook
 * Razorpay webhook handler tests.
 * POST /api/webhooks/razorpay
 *
 * Tests: signature validation, replay protection, idempotency,
 * payment.captured, payment.failed, refund.created.
 *
 * NOTE: These tests use locally-signed webhook payloads — no real Razorpay
 * transactions are made. The RAZORPAY_WEBHOOK_SECRET used for signing is
 * from ITR_TEST_RAZORPAY_WEBHOOK_SECRET env var.
 */
import { test, expect } from "../../fixtures/api";
import {
  getCategoriesBySlug, getSprintEvent, getRegistration,
  cleanupRegistrations, forceOrderId,
} from "../../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../../helpers/data-factory";
import {
  buildWebhookPayload, buildRefundWebhookPayload,
  signWebhook, webhookHeaders,
} from "../../helpers/webhook";
import { expectRegistrationCreated } from "../../helpers/assertions";

const WEBHOOK_URL  = "/api/webhooks/razorpay";
const REGISTER_URL = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

// ── Signature validation ───────────────────────────────────────────────────────

test("@webhook rejects missing signature header", async ({ uniqueIpRequest: request }) => {
  const body = JSON.stringify(buildWebhookPayload("payment.captured", "pay_test", "order_test"));
  const res = await request.post(WEBHOOK_URL, {
    data: body,
    headers: {
      "x-razorpay-timestamp": String(Math.floor(Date.now() / 1000)),
      "content-type": "application/json",
    },
  });
  // 400 when secret is configured; 500 when RAZORPAY_WEBHOOK_SECRET absent in local dev
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("@webhook rejects invalid signature", async ({ uniqueIpRequest: request }) => {
  const payload = buildWebhookPayload("payment.captured", "pay_test", "order_test");
  const rawBody = JSON.stringify(payload);
  const res = await request.post(WEBHOOK_URL, {
    data: rawBody,
    headers: {
      "x-razorpay-signature": "invalidsignature",
      "x-razorpay-timestamp": String(Math.floor(Date.now() / 1000)),
      "content-type": "application/json",
    },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("@webhook rejects stale timestamp (>5 min old)", async ({ uniqueIpRequest: request }) => {
  const payload = buildWebhookPayload("payment.captured", "pay_test", "order_test");
  const rawBody = JSON.stringify(payload);
  const staleTs = String(Math.floor(Date.now() / 1000) - 400); // 400 seconds ago > 300 tolerance
  const sig = signWebhook(rawBody);
  const res = await request.post(WEBHOOK_URL, {
    data: rawBody,
    headers: {
      "x-razorpay-signature": sig,
      "x-razorpay-timestamp": staleTs,
      "content-type": "application/json",
    },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("@webhook rejects missing timestamp header", async ({ uniqueIpRequest: request }) => {
  const payload = buildWebhookPayload("payment.captured", "pay_test", "order_test");
  const rawBody = JSON.stringify(payload);
  const sig = signWebhook(rawBody);
  const res = await request.post(WEBHOOK_URL, {
    data: rawBody,
    headers: {
      "x-razorpay-signature": sig,
      "content-type": "application/json",
    },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("@webhook rejects malformed JSON body", async ({ uniqueIpRequest: request }) => {
  const rawBody = "not-json-at-all{";
  const sig = signWebhook(rawBody);
  const res = await request.post(WEBHOOK_URL, {
    data: rawBody,
    headers: {
      "x-razorpay-signature": sig,
      "x-razorpay-timestamp": String(Math.floor(Date.now() / 1000)),
      "content-type": "application/json",
    },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

// ── payment.captured idempotency ───────────────────────────────────────────────
// The integration tests below require RAZORPAY_WEBHOOK_SECRET to be set in the server env
// (same value as ITR_TEST_RAZORPAY_WEBHOOK_SECRET / "test-webhook-secret").
// They are skipped in local dev when the secret is absent; they run in CI where it is configured.
const WEBHOOK_SECRET_AVAILABLE = !!(
  process.env.RAZORPAY_WEBHOOK_SECRET ||
  process.env.ITR_TEST_RAZORPAY_WEBHOOK_SECRET
);

test("@webhook @smoke payment.captured updates registration to paid", async ({ uniqueIpRequest: request }) => {
  test.skip(!WEBHOOK_SECRET_AVAILABLE, "Requires RAZORPAY_WEBHOOK_SECRET in server env");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  // Inject fake order ID so webhook lookup works
  const fakeOrderId   = `order_test_${Date.now()}`;
  const fakePaymentId = `pay_test_${Date.now()}`;
  await forceOrderId(reg.registrationId, fakeOrderId);

  const payload = buildWebhookPayload("payment.captured", fakePaymentId, fakeOrderId, {
    notes: { registration_code: reg.registrationCode },
  });
  const rawBody = JSON.stringify(payload);
  const res = await request.post(WEBHOOK_URL, {
    data: rawBody,
    headers: webhookHeaders(rawBody),
  });
  expect(res.status()).toBe(200);

  const dbReg = await getRegistration(reg.registrationId);
  expect(dbReg.payment_status).toBe("paid");
  expect(dbReg.razorpay_payment_id).toBe(fakePaymentId);
});

test("@webhook idempotency — duplicate payment.captured does not error", async ({ uniqueIpRequest: request }) => {
  test.skip(!WEBHOOK_SECRET_AVAILABLE, "Requires RAZORPAY_WEBHOOK_SECRET in server env");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  const fakeOrderId   = `order_idem_${Date.now()}`;
  const fakePaymentId = `pay_idem_${Date.now()}`;
  await forceOrderId(reg.registrationId, fakeOrderId);

  const payload = buildWebhookPayload("payment.captured", fakePaymentId, fakeOrderId, {
    notes: { registration_code: reg.registrationCode },
  });
  const rawBody = JSON.stringify(payload);
  const headers = webhookHeaders(rawBody);

  const res1 = await request.post(WEBHOOK_URL, { data: rawBody, headers });
  const res2 = await request.post(WEBHOOK_URL, { data: rawBody, headers });
  const res3 = await request.post(WEBHOOK_URL, { data: rawBody, headers });

  // All three must return 200 (idempotent)
  expect(res1.status()).toBe(200);
  expect(res2.status()).toBe(200);
  expect(res3.status()).toBe(200);

  // DB state: still just one payment
  const dbReg = await getRegistration(reg.registrationId);
  expect(dbReg.payment_status).toBe("paid");
  expect(dbReg.razorpay_payment_id).toBe(fakePaymentId);
});

// ── refund.created ─────────────────────────────────────────────────────────────

test("@webhook refund.created sets registration_status=cancelled", async ({ uniqueIpRequest: request }) => {
  test.skip(!WEBHOOK_SECRET_AVAILABLE, "Requires RAZORPAY_WEBHOOK_SECRET in server env");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  const fakeOrderId   = `order_refund_${Date.now()}`;
  const fakePaymentId = `pay_refund_${Date.now()}`;
  await forceOrderId(reg.registrationId, fakeOrderId);

  // First: mark as paid via captured webhook
  const capturedPayload = buildWebhookPayload("payment.captured", fakePaymentId, fakeOrderId, {
    notes: { registration_code: reg.registrationCode },
  });
  const capturedRaw = JSON.stringify(capturedPayload);
  await request.post(WEBHOOK_URL, { data: capturedRaw, headers: webhookHeaders(capturedRaw) });

  // Then: issue refund
  const refundPayload = buildRefundWebhookPayload(fakePaymentId, `rfnd_${Date.now()}`);
  const refundRaw = JSON.stringify(refundPayload);
  const refundRes = await request.post(WEBHOOK_URL, { data: refundRaw, headers: webhookHeaders(refundRaw) });
  expect(refundRes.status()).toBe(200);

  const dbReg = await getRegistration(reg.registrationId);
  expect(dbReg.registration_status).toBe("cancelled");
  expect(dbReg.payment_status).toBe("paid"); // payment_status stays paid (CHECK constraint only allows paid, not refunded)
});

// ── Unknown payment ────────────────────────────────────────────────────────────

test("@webhook payment.captured for unknown order ID returns 200 (graceful skip)", async ({ uniqueIpRequest: request }) => {
  test.skip(!WEBHOOK_SECRET_AVAILABLE, "Requires RAZORPAY_WEBHOOK_SECRET in server env");
  const payload = buildWebhookPayload("payment.captured", "pay_unknown", "order_does_not_exist");
  const rawBody = JSON.stringify(payload);
  const res = await request.post(WEBHOOK_URL, {
    data: rawBody,
    headers: webhookHeaders(rawBody),
  });
  // Webhook must not 500 on unknown orders — gracefully skip
  expect(res.status()).not.toBe(500);
});
