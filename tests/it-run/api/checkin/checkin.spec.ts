/**
 * @checkin
 * Check-in system tests.
 * GET /api/it-run/checkin  — scan lookup (requires auth)
 * POST /api/it-run/checkin — record check-in (requires auth)
 *
 * Also verifies the admin scan route GET /api/it-run/admin/scan.
 */
import { test, expect } from "@playwright/test";
import {
  getCategoriesBySlug, getSprintEvent, getRegistration, getParticipants,
  getCheckins, cleanupRegistrations, forcePaymentStatus, getTestDb,
} from "../../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../../helpers/data-factory";
import { expectRegistrationCreated } from "../../helpers/assertions";
import { test as apiTest, AdminApiContext } from "../../fixtures/api";

const REGISTER_URL = "/api/it-run/register";
const CHECKIN_URL  = "/api/it-run/checkin";
const SCAN_URL     = "/api/it-run/admin/scan";

const RUN_IP = `10.${Math.floor(Date.now() / 1000) % 200 + 10}.${Math.floor(Math.random() * 250) + 1}.11`;
apiTest.use({ extraHTTPHeaders: { "x-forwarded-for": RUN_IP } });

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
let eventId: string;
const createdIds: string[] = [];

apiTest.beforeAll(async () => {
  categories = await getCategoriesBySlug();
  const event = await getSprintEvent();
  eventId = event.id;
});

apiTest.afterAll(async () => { await cleanupRegistrations(createdIds); });

const ADMIN_CREDS_AVAILABLE = !!(process.env.ITR_TEST_ADMIN_EMAIL && process.env.ITR_TEST_ADMIN_PASSWORD);

// ── Auth guard on checkin endpoints ───────────────────────────────────────────

apiTest("@checkin @security unauthenticated GET /checkin returns 401", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${CHECKIN_URL}?q=BIB1001`);
  expect(res.status()).toBe(401);
});

apiTest("@checkin @security unauthenticated POST /checkin returns 401", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(CHECKIN_URL, {
    data: { participantId: "00000000-0000-0000-0000-000000000000" },
  });
  expect(res.status()).toBe(401);
});

apiTest("@checkin @security unauthenticated GET /admin/scan returns 401", async ({ uniqueIpRequest: request }) => {
  const res = await request.get(`${SCAN_URL}?q=BIB1001`);
  expect(res.status()).toBe(401);
});

// ── QR token based check-in (requires admin login) ────────────────────────────

apiTest("@checkin @smoke paid participant can be checked in via participant ID", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  // Create + pay a registration
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);
  await forcePaymentStatus(reg.registrationId, "paid");

  const parts = await getParticipants(reg.registrationId);
  const participantId = parts[0].id;

  // Check in via admin API
  const checkRes = await adminApi.post(CHECKIN_URL, { participantId });
  expect(checkRes.status()).toBe(200);
  const body = await checkRes.json() as { ok: boolean; name: string; bib: string | null };
  expect(body.ok).toBe(true);
  expect(body.name).toBeTruthy();

  // Verify DB state
  const checkins = await getCheckins(participantId);
  expect(checkins).toHaveLength(1);
});

apiTest("@checkin duplicate check-in returns 409 with already=true", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);
  await forcePaymentStatus(reg.registrationId, "paid");

  const parts = await getParticipants(reg.registrationId);
  const participantId = parts[0].id;

  // First check-in
  const res1 = await adminApi.post(CHECKIN_URL, { participantId });
  expect(res1.status()).toBe(200);

  // Second check-in (duplicate)
  const res2 = await adminApi.post(CHECKIN_URL, { participantId });
  expect(res2.status()).toBe(409);
  const body = await res2.json() as { already?: boolean };
  expect(body.already).toBe(true);
});

apiTest("@checkin @security cancelled registration cannot be checked in", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);

  // Force paid + cancelled
  const db = getTestDb();
  await db.from("it_run_registrations")
    .update({ payment_status: "paid", registration_status: "cancelled" })
    .eq("id", reg.registrationId);

  const parts = await getParticipants(reg.registrationId);
  const res = await adminApi.post(CHECKIN_URL, { participantId: parts[0].id });
  expect(res.status()).toBe(400);
  const body = await res.json() as { error: string };
  expect(body.error).toContain("cancelled");
});

apiTest("@checkin unpaid registration cannot be checked in", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);
  // payment_status stays "pending" — not paid or free

  const parts = await getParticipants(reg.registrationId);
  const res = await adminApi.post(CHECKIN_URL, { participantId: parts[0].id });
  expect(res.status()).toBe(400);
});

apiTest("@checkin free registration CAN be checked in", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);
  await forcePaymentStatus(reg.registrationId, "free");

  const parts = await getParticipants(reg.registrationId);
  const res = await adminApi.post(CHECKIN_URL, { participantId: parts[0].id });
  expect(res.status()).toBe(200);
});

apiTest("@checkin invalid participantId returns 4xx", async ({ adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const res = await adminApi.post(CHECKIN_URL, {
    participantId: "00000000-0000-0000-0000-000000000000",
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

// ── Admin scan (GET /admin/scan) ────────────────────────────────────────────────

apiTest("@checkin admin scan by BIB number returns participant data", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);
  await forcePaymentStatus(reg.registrationId, "paid");

  // Assign a test BIB number directly
  const db = getTestDb();
  const parts = await getParticipants(reg.registrationId);
  const testBib = `399${Date.now().toString().slice(-3)}`;
  await db.from("it_run_participants").update({ bib_number: testBib }).eq("id", parts[0].id);

  const scanRes = await adminApi.get(SCAN_URL, { q: testBib });
  expect(scanRes.status()).toBe(200);
  const body = await scanRes.json() as { participant?: { id: string } };
  expect(body.participant).toBeTruthy();
});
