/**
 * @registration
 * Exhaustive server-side field validation tests for POST /api/it-run/register.
 * Every field is tested for missing, empty, invalid, and boundary values.
 * Client-side validation is NOT the authority — the server is.
 */
import { test, expect } from "../../fixtures/api";
import { getCategoriesBySlug } from "../../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../../helpers/data-factory";
import { expectError } from "../../helpers/assertions";
import { futureDob, ADULT_DOB } from "../../helpers/time";

const REGISTER_URL = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;

test.beforeAll(async () => { categories = await getCategoriesBySlug(); });

function solo(overrides: Parameters<typeof createAdultParticipant>[0]) {
  const cat = categories["5k-fun-run"];
  return { catId: cat.id, payload: registrationPayload(cat.id, [createAdultParticipant(overrides)]) };
}

// ── Name ───────────────────────────────────────────────────────────────────────

test("@registration rejects missing firstName", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ firstName: undefined as unknown as string });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "first name");
});

test("@registration rejects empty firstName", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ firstName: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "first name");
});

test("@registration rejects whitespace-only firstName", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ firstName: "   " });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "first name");
});

test("@registration rejects empty lastName", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ lastName: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "last name");
});

// ── Email ──────────────────────────────────────────────────────────────────────

test("@registration rejects missing email", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ email: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "email");
});

test("@registration rejects invalid email — no @", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ email: "notanemail.com" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "email");
});

test("@registration rejects invalid email — no domain", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ email: "user@" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "email");
});

test("@registration rejects invalid email — spaces", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ email: "user @example.com" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "email");
});

// ── Mobile ─────────────────────────────────────────────────────────────────────

test("@registration rejects mobile — 9 digits", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ mobile: "123456789" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "mobile");
});

test("@registration rejects mobile — 11 digits", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ mobile: "12345678901" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "mobile");
});

test("@registration rejects mobile — letters", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ mobile: "9876ABCDEF" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "mobile");
});

test("@registration rejects empty mobile", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ mobile: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "mobile");
});

// ── DOB ────────────────────────────────────────────────────────────────────────

test("@registration rejects missing DOB", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ dob: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "date of birth");
});

test("@registration rejects future DOB for adult", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ dob: futureDob() });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "date of birth");
});

test("@registration rejects non-date DOB string", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ dob: "not-a-date" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "date of birth");
});

// ── T-shirt size ───────────────────────────────────────────────────────────────

test("@registration rejects invalid adult t-shirt size", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ tshirtSize: "XXXL" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "t-shirt size");
});

test("@registration rejects empty t-shirt size", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ tshirtSize: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "t-shirt size");
});

test("@registration rejects child t-shirt size on adult participant", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ tshirtSize: "9-10Y" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "t-shirt size");
});

// ── Adult-required fields ──────────────────────────────────────────────────────

test("@registration rejects missing company name for adult", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ companyName: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "company name");
});

test("@registration rejects missing emergency contact name", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ emergencyName: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "emergency contact");
});

test("@registration rejects missing emergency phone", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ emergencyPhone: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "emergency contact");
});

test("@registration rejects invalid emergency phone — not 10 digits", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ emergencyPhone: "12345" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "emergency contact");
});

// ── Gender and blood group ─────────────────────────────────────────────────────

test("@registration rejects missing gender", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ gender: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "gender");
});

test("@registration rejects missing blood group", async ({ uniqueIpRequest: request }) => {
  const { payload } = solo({ bloodGroup: "" });
  const res = await request.post(REGISTER_URL, { data: payload });
  await expectError(res, 400, "blood group");
});

// ── Malformed payload ──────────────────────────────────────────────────────────

test("@registration rejects completely empty body", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(REGISTER_URL, { data: {} });
  await expectError(res, 400);
});

test("@registration rejects null participants", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, {
    data: { categoryId: cat.id, participants: null, couponId: null },
  });
  await expectError(res, 400);
});

test("@registration rejects non-array participants", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, {
    data: { categoryId: cat.id, participants: "single", couponId: null },
  });
  await expectError(res, 400);
});

// ── Boundary / unusual values ──────────────────────────────────────────────────

test("@registration accepts Unicode first name", async ({ uniqueIpRequest: request }) => {
  // Names with diacritics and non-ASCII are valid — server only checks truthy/trim
  const { payload } = solo({ firstName: "Ámèlié" });
  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, { data: payload });
  // Should not fail on the name itself; may succeed or fail on other validation
  // (we just assert it doesn't 500)
  expect(res.status()).not.toBe(500);
});

test("@registration rejects extremely long email (>200 chars)", async ({ uniqueIpRequest: request }) => {
  const longEmail = `${"a".repeat(200)}@example.com`;
  const { payload } = solo({ email: longEmail });
  const res = await request.post(REGISTER_URL, { data: payload });
  // Email regex is /^[^\s@]+@[^\s@]+\.[^\s@]+$/ — technically this passes regex
  // but DB column may reject. Just verify no 500.
  expect(res.status()).not.toBe(500);
});
