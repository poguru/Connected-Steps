/**
 * @registration @coupon @smoke
 * Free registration path — 100% coupon.
 * Critical: must trigger confirmation email immediately (no payment flow).
 */
import { test, expect } from "../../fixtures/api";
import {
  getCategoriesBySlug, getSprintEvent, getRegistration, getParticipants,
  createTestCoupon, deleteTestCoupon, cleanupRegistrations,
} from "../../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../../helpers/data-factory";
import { expectRegistrationCreated } from "../../helpers/assertions";

const REGISTER_URL = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
let eventId: string;
let coupon100pctId: string;
const createdIds: string[] = [];

test.beforeAll(async () => {
  categories = await getCategoriesBySlug();
  const event = await getSprintEvent();
  expect(event, "sprint-2 event not found").toBeTruthy();
  eventId = event.id;

  // Create a 100% discount coupon for testing
  coupon100pctId = await createTestCoupon(eventId, {
    code: `FREEFULL${Date.now()}`,
    discountType: "percent",
    discountValue: 100,
    maxUses: 50,
    isActive: true,
  });
});

test.afterAll(async () => {
  await cleanupRegistrations(createdIds);
  await deleteTestCoupon(coupon100pctId);
});

// ── Happy path ─────────────────────────────────────────────────────────────────

test("@registration @smoke 100% coupon produces finalPrice=0 and payment_status=free", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];

  // Step 1: validate coupon to get its ID
  const validateRes = await request.post("/api/it-run/coupons/validate", {
    data: { code: `FREEFULL${Date.now()}`, categoryId: cat.id, amount: cat.price_rupees },
  });
  // The coupon code includes timestamp so we need to fetch from DB
  // Use the coupon ID directly from DB fixture
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()], coupon100pctId),
  });
  const body = await expectRegistrationCreated(res);
  expect(body.finalPrice).toBe(0);
  createdIds.push(body.registrationId);

  const reg = await getRegistration(body.registrationId);
  expect(reg.payment_status).toBe("free");
  expect(reg.registration_status).toBe("active");
  expect(reg.final_price).toBe(0);
  expect(reg.discount_amount).toBe(cat.price_rupees);
  expect(reg.coupon_id).toBe(coupon100pctId);

  const parts = await getParticipants(body.registrationId);
  expect(parts).toHaveLength(1);
  expect(parts[0].qr_token).toBeTruthy();
});

test("@registration free registration does NOT require payment to be active", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()], coupon100pctId),
  });
  const body = await expectRegistrationCreated(res);
  createdIds.push(body.registrationId);

  const reg = await getRegistration(body.registrationId);
  expect(reg.payment_status).toBe("free");
  // Verify it can be found from dashboard without payment
  const dashRes = await request.get(`/api/it-run/dashboard/${body.registrationCode}`);
  expect(dashRes.ok()).toBe(true);
  const dash = await dashRes.json() as { reg: { payment_status: string } };
  expect(dash.reg.payment_status).toBe("free");
});

test("@registration free registration increments coupon use_count by 1", async ({ uniqueIpRequest: request }) => {
  const { getTestDb } = await import("../../fixtures/db");
  const db = getTestDb();

  const { data: before } = await db.from("it_run_coupons").select("use_count").eq("id", coupon100pctId).single();
  const countBefore = before!.use_count as number;

  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()], coupon100pctId),
  });
  const body = await expectRegistrationCreated(res);
  createdIds.push(body.registrationId);

  const { data: after } = await db.from("it_run_coupons").select("use_count").eq("id", coupon100pctId).single();
  expect(after!.use_count).toBe(countBefore + 1);
});

test("@registration free registration — create-order returns error (already free)", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()], coupon100pctId),
  });
  const body = await expectRegistrationCreated(res);
  createdIds.push(body.registrationId);

  // Attempting to create a payment order for a free registration should fail
  const orderRes = await request.post("/api/it-run/payment/create-order", {
    data: { registrationId: body.registrationId },
  });
  expect(orderRes.status()).not.toBe(200); // free registrations don't need orders
});
