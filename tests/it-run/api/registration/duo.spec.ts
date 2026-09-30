/**
 * @registration
 * 5K Duo Challenge registration tests.
 * Verifies two-participant creation, unique QRs, field validation per participant.
 */
import { test, expect } from "../../fixtures/api";
import { getCategoriesBySlug, getRegistration, getParticipants, cleanupRegistrations } from "../../fixtures/db";
import { createAdultParticipant, createDuoParticipants, registrationPayload } from "../../helpers/data-factory";
import { expectRegistrationCreated, expectError } from "../../helpers/assertions";

const REGISTER_URL = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

// ── Happy path ─────────────────────────────────────────────────────────────────

test("@registration @smoke valid duo registration creates 2 participants with unique QRs", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  expect(cat, "5k-duo not found").toBeTruthy();

  const [p1, p2] = createDuoParticipants();
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [p1, p2]),
  });
  const body = await expectRegistrationCreated(res);

  expect(body.participantIds).toHaveLength(2);
  expect(body.finalPrice).toBe(cat.price_rupees); // 1399
  createdIds.push(body.registrationId);

  const reg = await getRegistration(body.registrationId);
  expect(reg.participant_count).toBe(2);
  expect(reg.payment_status).toBe("pending");

  const parts = await getParticipants(body.registrationId);
  expect(parts).toHaveLength(2);

  // Both must have unique QR tokens
  expect(parts[0].qr_token).toBeTruthy();
  expect(parts[1].qr_token).toBeTruthy();
  expect(parts[0].qr_token).not.toBe(parts[1].qr_token);
  expect(parts[0].id).not.toBe(parts[1].id);
});

// ── Participant count enforcement ──────────────────────────────────────────────

test("@registration duo rejects 1 participant", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  await expectError(res, 400, "Expected 2 participant");
});

test("@registration duo rejects 3 participants", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [
      createAdultParticipant(), createAdultParticipant(), createAdultParticipant(),
    ]),
  });
  await expectError(res, 400, "Expected 2 participant");
});

// ── Participant 2 field validation ─────────────────────────────────────────────

test("@registration duo rejects missing email on participant 2", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  const [p1] = createDuoParticipants();
  const p2  = createAdultParticipant({ email: "" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [p1, p2]),
  });
  await expectError(res, 400, "email");
});

test("@registration duo rejects invalid tshirt size on participant 2", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  const [p1] = createDuoParticipants();
  const p2  = createAdultParticipant({ tshirtSize: "XXXL" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [p1, p2]),
  });
  await expectError(res, 400, "t-shirt size");
});

test("@registration duo rejects child t-shirt size on participant 2 (adult)", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  const [p1] = createDuoParticipants();
  const p2  = createAdultParticipant({ tshirtSize: "9-10Y" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [p1, p2]),
  });
  await expectError(res, 400, "t-shirt size");
});

test("@registration duo rejects missing emergency contact on participant 2", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  const [p1] = createDuoParticipants();
  const p2  = createAdultParticipant({ emergencyName: "" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [p1, p2]),
  });
  await expectError(res, 400, "emergency contact");
});

// ── Same email for both participants ───────────────────────────────────────────

test("@registration duo allows same email for both participants (not restricted)", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-duo"];
  const sharedEmail = `itr.test+duo${Date.now()}@connectedsteps.test`;
  const p1 = createAdultParticipant({ email: sharedEmail });
  const p2 = createAdultParticipant({ email: sharedEmail });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [p1, p2]),
  });
  const body = await expectRegistrationCreated(res);
  createdIds.push(body.registrationId);
});
