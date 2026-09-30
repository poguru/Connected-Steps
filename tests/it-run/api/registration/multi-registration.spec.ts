/**
 * @registration
 * Multiple registrations with the same lead email.
 * The application MUST support legitimate multiple registrations (same email, different people).
 * No UNIQUE(event_id, lead_email) constraint exists by design.
 */
import { test, expect } from "../../fixtures/api";
import { getCategoriesBySlug, cleanupRegistrations } from "../../fixtures/db";
import { createAdultParticipant, registrationPayload, testEmail } from "../../helpers/data-factory";
import { expectRegistrationCreated } from "../../helpers/assertions";

const REGISTER_URL = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

test("@registration same email can register multiple times for same category", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const sharedEmail = testEmail("multi");

  const res1 = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant({ email: sharedEmail })]),
  });
  const res2 = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant({ email: sharedEmail })]),
  });
  const res3 = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant({ email: sharedEmail })]),
  });

  const b1 = await expectRegistrationCreated(res1);
  const b2 = await expectRegistrationCreated(res2);
  const b3 = await expectRegistrationCreated(res3);

  createdIds.push(b1.registrationId, b2.registrationId, b3.registrationId);

  // All must be unique registrations
  const ids = new Set([b1.registrationId, b2.registrationId, b3.registrationId]);
  expect(ids.size).toBe(3);

  const codes = new Set([b1.registrationCode, b2.registrationCode, b3.registrationCode]);
  expect(codes.size).toBe(3);
});

test("@registration same email can register for different categories", async ({ uniqueIpRequest: request }) => {
  const sharedEmail = testEmail("crosscat");

  const res10k = await request.post(REGISTER_URL, {
    data: registrationPayload(
      categories["10k-timed"].id,
      [createAdultParticipant({ email: sharedEmail })],
    ),
  });
  const res5k = await request.post(REGISTER_URL, {
    data: registrationPayload(
      categories["5k-fun-run"].id,
      [createAdultParticipant({ email: sharedEmail })],
    ),
  });

  const b10k = await expectRegistrationCreated(res10k);
  const b5k  = await expectRegistrationCreated(res5k);
  createdIds.push(b10k.registrationId, b5k.registrationId);

  expect(b10k.registrationId).not.toBe(b5k.registrationId);
  expect(b10k.finalPrice).toBe(999);
  expect(b5k.finalPrice).toBe(649);
});

test("@registration different participants can register with the same lead email (friend registration)", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const leadEmail = testEmail("lead");

  // Person A registers for themselves
  const p1 = createAdultParticipant({ email: leadEmail, firstName: "PersonA" });
  // Person A registers for friend B (different participant data, same lead email)
  const p2 = createAdultParticipant({ email: leadEmail, firstName: "PersonB" });

  const res1 = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [p1]) });
  const res2 = await request.post(REGISTER_URL, { data: registrationPayload(cat.id, [p2]) });

  const b1 = await expectRegistrationCreated(res1);
  const b2 = await expectRegistrationCreated(res2);
  createdIds.push(b1.registrationId, b2.registrationId);

  expect(b1.registrationCode).not.toBe(b2.registrationCode);
});
