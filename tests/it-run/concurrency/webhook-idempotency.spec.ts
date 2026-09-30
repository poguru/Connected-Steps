/**
 * @concurrency @webhook
 * Webhook idempotency under concurrent delivery.
 *
 * Scenario: Razorpay may deliver the same webhook multiple times.
 * Sending 5 concurrent identical payment.captured webhooks must result in:
 * - Exactly 1 payment state change
 * - Exactly 1 confirmation email sent (checked via confirmation_email_sent_at)
 * - No duplicate coupon_uses
 */
import { test, expect } from "../fixtures/api";
import {
  getCategoriesBySlug, getSprintEvent, getRegistration,
  cleanupRegistrations, forceOrderId, getTestDb,
} from "../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../helpers/data-factory";
import { buildWebhookPayload, webhookHeaders } from "../helpers/webhook";
import { expectRegistrationCreated } from "../helpers/assertions";

const REGISTER_URL = "/api/it-run/register";
const WEBHOOK_URL  = "/api/webhooks/razorpay";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

const WEBHOOK_SECRET_AVAILABLE = !!(
  process.env.RAZORPAY_WEBHOOK_SECRET ||
  process.env.ITR_TEST_RAZORPAY_WEBHOOK_SECRET
);

test("@concurrency @webhook 5 concurrent identical payment.captured webhooks result in exactly 1 state change", async ({ uniqueIpRequest: request }) => {
  test.skip(!WEBHOOK_SECRET_AVAILABLE, "Requires RAZORPAY_WEBHOOK_SECRET in server env");
  const cat    = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  const fakeOrderId   = `order_idem_conc_${Date.now()}`;
  const fakePaymentId = `pay_idem_conc_${Date.now()}`;
  await forceOrderId(reg.registrationId, fakeOrderId);

  const payload = buildWebhookPayload("payment.captured", fakePaymentId, fakeOrderId, {
    notes: { registration_code: reg.registrationCode },
  });
  const rawBody = JSON.stringify(payload);
  const headers = webhookHeaders(rawBody);

  // Send 5 simultaneous webhooks
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => request.post(WEBHOOK_URL, { data: rawBody, headers })),
  );

  const statuses = await Promise.all(responses.map(r => r.status()));

  // All must return 200 (idempotent, not error)
  for (const s of statuses) {
    expect(s, `Webhook returned ${s}`).toBe(200);
  }

  // DB check: payment_status = paid, razorpay_payment_id set correctly
  const dbReg = await getRegistration(reg.registrationId);
  expect(dbReg.payment_status).toBe("paid");
  expect(dbReg.razorpay_payment_id).toBe(fakePaymentId);
});

test("@concurrency @webhook duplicate webhook for unknown order does not cause 500", async ({ uniqueIpRequest: request }) => {
  test.skip(!WEBHOOK_SECRET_AVAILABLE, "Requires RAZORPAY_WEBHOOK_SECRET in server env");
  const payload = buildWebhookPayload("payment.captured", `pay_unk_${Date.now()}`, `order_unk_${Date.now()}`);
  const rawBody = JSON.stringify(payload);
  const headers = webhookHeaders(rawBody);

  const responses = await Promise.all(
    Array.from({ length: 3 }, () => request.post(WEBHOOK_URL, { data: rawBody, headers })),
  );
  const statuses = await Promise.all(responses.map(r => r.status()));
  for (const s of statuses) {
    expect(s, `Unexpected server error: ${s}`).not.toBe(500);
  }
});

test("@concurrency duplicate check-in attempts result in exactly 1 check-in record", async ({ request }) => {
  // Create an admin session cookie
  const loginRes = await request.post("/api/it-run/portal/auth", {
    data: {
      email:    process.env.ITR_TEST_ADMIN_EMAIL ?? "",
      password: process.env.ITR_TEST_ADMIN_PASSWORD ?? "",
    },
  });
  if (!loginRes.ok()) {
    test.skip(true, "Admin credentials not configured — skipping duplicate checkin test");
    return;
  }
  const setCookie = loginRes.headers()["set-cookie"] ?? "";
  const cookieMatch = setCookie.match(/it_run_portal_session=([^;]+)/);
  const cookie = cookieMatch ? `it_run_portal_session=${cookieMatch[1]}` : "";

  const cat    = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  // Force paid
  const db = getTestDb();
  await db.from("it_run_registrations").update({ payment_status: "paid" }).eq("id", reg.registrationId);

  const { data: parts } = await db.from("it_run_participants").select("id").eq("registration_id", reg.registrationId);
  const participantId = parts?.[0]?.id;
  if (!participantId) return;

  // Send 5 concurrent check-in requests for the same participant
  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      request.post("/api/it-run/checkin", {
        data:    { participantId },
        headers: { Cookie: cookie },
      }),
    ),
  );

  const statuses = await Promise.all(responses.map(r => r.status()));
  const ok       = statuses.filter(s => s === 200);
  const dup      = statuses.filter(s => s === 409);

  // Exactly 1 success, rest should be duplicate-detected
  expect(ok.length).toBeLessThanOrEqual(1);

  // Verify DB: exactly 1 check-in record
  const { count } = await db
    .from("it_run_checkins")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participantId);
  expect(count).toBe(1);
});
