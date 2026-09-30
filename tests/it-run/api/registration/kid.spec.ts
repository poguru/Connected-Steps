/**
 * @registration
 * 2K Parent & Child Duo registration tests.
 * Child age rule: child must be 10 years or younger on the EVENT DATE (2027-02-07).
 * Server rule: ageOnEventDay >= 11 → rejected.
 */
import { test, expect } from "../../fixtures/api";
import { getCategoriesBySlug, getRegistration, getParticipants, cleanupRegistrations } from "../../fixtures/db";
import { createAdultParticipant, createChildParticipant, createParentChildParticipants, registrationPayload } from "../../helpers/data-factory";
import { expectRegistrationCreated, expectError } from "../../helpers/assertions";
import {
  CHILD_DOB_AGE_10_EXACT,
  CHILD_DOB_AGE_10_MINUS_1,
  CHILD_DOB_AGE_11_EXACT,
  CHILD_DOB_AGE_11_PLUS_1,
  CHILD_DOB_AGE_6_EXACT,
  CHILD_DOB_AGE_5,
  ADULT_DOB,
  futureDob,
  dobForAge,
} from "../../helpers/time";

const REGISTER_URL = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });
test.afterAll(async () => { await cleanupRegistrations(createdIds); });

// ── Happy paths ────────────────────────────────────────────────────────────────

test("@registration @smoke valid parent + child (age 10 exactly on event date)", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  expect(cat, "parent-child-duo not found").toBeTruthy();

  const [parent, child] = createParentChildParticipants();
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  const body = await expectRegistrationCreated(res);
  expect(body.participantIds).toHaveLength(2);
  expect(body.finalPrice).toBe(999);
  createdIds.push(body.registrationId);

  const parts = await getParticipants(body.registrationId);
  expect(parts).toHaveLength(2);

  const parentPart = parts[0];
  const childPart  = parts[1];

  // Parent: should have email, emergency contact
  expect(parentPart.email).toBeTruthy();
  // Child: email column should be null/empty (server sets it from input, but child input has no email)
  // QR unique per participant
  expect(parentPart.qr_token).not.toBe(childPart.qr_token);
  // Child is auto-verified (no company verification needed)
  expect(childPart.verification_status).toBe("verified");
});

test("@registration valid child — age 9 years 364 days on event date (just under limit)", async ({ uniqueIpRequest: request }) => {
  const cat  = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  const child = createChildParticipant({ dob: CHILD_DOB_AGE_10_MINUS_1, tshirtSize: "7-8Y" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  const body = await expectRegistrationCreated(res);
  createdIds.push(body.registrationId);
});

test("@registration valid child — age 6 on event date", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  const child = createChildParticipant({ dob: CHILD_DOB_AGE_6_EXACT, tshirtSize: "5-6Y" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  const body = await expectRegistrationCreated(res);
  createdIds.push(body.registrationId);
});

test("@registration valid child — age 5 on event date", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  const child = createChildParticipant({ dob: CHILD_DOB_AGE_5, tshirtSize: "5-6Y" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  const body = await expectRegistrationCreated(res);
  createdIds.push(body.registrationId);
});

// ── Age boundary rejections ────────────────────────────────────────────────────

test("@registration rejects child who turns 11 exactly on event date", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  // ageOnEventDay === 11 → rejected (rule: >= 11 fails)
  const child = createChildParticipant({ dob: CHILD_DOB_AGE_11_EXACT });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  await expectError(res, 400, "10 years or younger");
});

test("@registration rejects child already 11 years old on event date", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  const child = createChildParticipant({ dob: CHILD_DOB_AGE_11_PLUS_1 });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  await expectError(res, 400, "10 years or younger");
});

test("@registration rejects child age 12 on event date", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  const child = createChildParticipant({ dob: dobForAge(12) });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  await expectError(res, 400, "10 years or younger");
});

// ── Invalid child data ─────────────────────────────────────────────────────────

test("@registration rejects future DOB for child", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  const child = createChildParticipant({ dob: futureDob() });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  await expectError(res, 400, "date of birth");
});

test("@registration rejects adult T-shirt size for child participant", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  const child = createChildParticipant({ tshirtSize: "M" }); // adult size
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  await expectError(res, 400, "t-shirt size");
});

test("@registration rejects child T-shirt size for parent (adult)", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const parent = createAdultParticipant({ tshirtSize: "9-10Y" }); // child size on adult
  const child  = createChildParticipant();
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  await expectError(res, 400, "t-shirt size");
});

test("@registration rejects adult DOB submitted as child position (would make child ~35 yrs)", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent] = createParentChildParticipants();
  // index 1 is child position — submit an adult DOB → age ~35, fails child check (age >= 11)
  const child = createChildParticipant({ dob: ADULT_DOB, tshirtSize: "9-10Y" });
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child]),
  });
  await expectError(res, 400, "10 years or younger");
});

// ── Participant count enforcement ──────────────────────────────────────────────

test("@registration kid category rejects 1 participant", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  await expectError(res, 400, "Expected 2 participant");
});

test("@registration kid category rejects 3 participants", async ({ uniqueIpRequest: request }) => {
  const cat = categories["parent-child-duo"];
  const [parent, child] = createParentChildParticipants();
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [parent, child, createAdultParticipant()]),
  });
  await expectError(res, 400, "Expected 2 participant");
});
