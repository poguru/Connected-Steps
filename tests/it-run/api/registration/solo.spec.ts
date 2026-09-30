/**
 * @registration @smoke
 * Solo category registration — 10K, 5K Timed, 5K Fun Run.
 * Tests the happy path for each solo category and verifies DB state.
 */
import { test, expect } from "../../fixtures/api";
import { getCategoriesBySlug, getRegistration, getParticipants, cleanupRegistrations } from "../../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../../helpers/data-factory";
import { expectRegistrationCreated, expectError } from "../../helpers/assertions";

const REGISTER_URL = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdRegistrationIds: string[] = [];

test.beforeAll(async () => {
  categories = await getCategoriesBySlug();
});

test.afterAll(async () => {
  await cleanupRegistrations(createdRegistrationIds);
});

// ── Happy paths ────────────────────────────────────────────────────────────────

for (const slug of ["10k-timed", "5k-timed", "5k-fun-run"] as const) {
  test(`@smoke @registration valid solo registration — ${slug}`, async ({ uniqueIpRequest: request }) => {
    const cat = categories[slug];
    expect(cat, `Category ${slug} not found in DB`).toBeTruthy();

    const payload = registrationPayload(cat.id, [createAdultParticipant()]);
    const res = await request.post(REGISTER_URL, { data: payload });
    const body = await expectRegistrationCreated(res);

    expect(body.participantIds).toHaveLength(1);
    expect(body.finalPrice).toBe(cat.price_rupees);

    createdRegistrationIds.push(body.registrationId);

    // Verify DB state
    const reg = await getRegistration(body.registrationId);
    expect(reg.payment_status).toBe("pending");
    expect(reg.registration_status).toBe("active");
    expect(reg.final_price).toBe(cat.price_rupees);
    expect(reg.participant_count).toBe(1);

    const parts = await getParticipants(body.registrationId);
    expect(parts).toHaveLength(1);
    expect(parts[0].qr_token).toBeTruthy();
    expect(parts[0].verification_status).toBe("need_clarification"); // no company ID uploaded
  });
}

// ── Participant count enforcement ──────────────────────────────────────────────

test("@registration solo category rejects 0 participants", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, {
    data: { categoryId: cat.id, couponId: null, participants: [] },
  });
  await expectError(res, 400);
});

test("@registration solo category rejects 2 participants", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const payload = registrationPayload(cat.id, [
    createAdultParticipant(), createAdultParticipant(),
  ]);
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "Expected 1 participant");
});

test("@registration rejects inactive category", async ({ uniqueIpRequest: request }) => {
  // Use a fake UUID — should 404 as category not found or inactive
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload("00000000-0000-0000-0000-000000000000", [createAdultParticipant()]),
  });
  await expectError(res, 404);
});

test("@registration rejects missing categoryId", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(REGISTER_URL, {
    data: { couponId: null, participants: [createAdultParticipant()] },
  });
  await expectError(res, 400);
});

// ── Prices verified from DB ────────────────────────────────────────────────────

test("@registration category prices match expected Sprint-2 pricing", async () => {
  const expected: Record<string, number> = {
    "10k-timed":   999,
    "5k-timed":    799,
    "5k-fun-run":  649,
    "5k-duo":           1399,
    "parent-child-duo": 999,
  };
  for (const [slug, price] of Object.entries(expected)) {
    const cat = categories[slug];
    expect(cat, `${slug} not found`).toBeTruthy();
    expect(cat.price_rupees, `${slug} price mismatch — DB has ${cat.price_rupees}, expected ${price}`).toBe(price);
  }
});

// ── QR token uniqueness ────────────────────────────────────────────────────────

test("@registration @qr each registration gets a unique QR token", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const [res1, res2] = await Promise.all([
    request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) }),
    request.post(REGISTER_URL, { data: registrationPayload(cat.id, [createAdultParticipant()]) }),
  ]);

  const b1 = await expectRegistrationCreated(res1);
  const b2 = await expectRegistrationCreated(res2);

  createdRegistrationIds.push(b1.registrationId, b2.registrationId);

  const parts1 = await getParticipants(b1.registrationId);
  const parts2 = await getParticipants(b2.registrationId);

  expect(parts1[0].qr_token).not.toBe(parts2[0].qr_token);
  expect(b1.registrationCode).not.toBe(b2.registrationCode);
  expect(b1.registrationId).not.toBe(b2.registrationId);
});
