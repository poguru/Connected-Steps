/**
 * @coupon
 * Coupon validation — all states, boundary values, error paths.
 * POST /api/it-run/coupons/validate
 */
import { test, expect } from "../../fixtures/api";
import {
  getCategoriesBySlug, getSprintEvent, createTestCoupon, deleteTestCoupon,
  cleanupRegistrations, getTestDb,
} from "../../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../../helpers/data-factory";
import { expectOk, expectError } from "../../helpers/assertions";

const VALIDATE_URL = "/api/it-run/coupons/validate";
const REGISTER_URL  = "/api/it-run/register";

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
let eventId: string;
const couponIds: string[] = [];
const regIds: string[] = [];

test.beforeAll(async () => {
  categories = await getCategoriesBySlug();
  const event = await getSprintEvent();
  eventId = event.id;
});

test.afterAll(async () => {
  await cleanupRegistrations(regIds);
  for (const id of couponIds) await deleteTestCoupon(id);
});

// ── Percent coupon ─────────────────────────────────────────────────────────────

test("@coupon @smoke valid percent coupon returns correct discount", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { discountType: "percent", discountValue: 20, maxUses: 10 });
  couponIds.push(id);
  const db = getTestDb();
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  const body = await expectOk(res) as { discount: number; label: string };
  expect(body.discount).toBe(Math.round(cat.price_rupees * 20 / 100)); // 130
  expect(body.label).toBeTruthy();
});

// ── Flat coupon ────────────────────────────────────────────────────────────────

test("@coupon valid flat coupon returns correct discount", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { discountType: "flat", discountValue: 100, maxUses: 5 });
  couponIds.push(id);
  const db = getTestDb();
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  const body = await expectOk(res) as { discount: number };
  expect(body.discount).toBe(100);
});

// ── 100% coupon ────────────────────────────────────────────────────────────────

test("@coupon @smoke 100% percent coupon returns discount equal to full price", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { discountType: "percent", discountValue: 100, maxUses: 5 });
  couponIds.push(id);
  const db = getTestDb();
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  const body = await expectOk(res) as { discount: number };
  expect(body.discount).toBe(cat.price_rupees); // full price
});

// ── Invalid coupon states ──────────────────────────────────────────────────────

test("@coupon wrong code returns 400", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: "WRONGCODE99", categoryId: cat.id, amount: cat.price_rupees },
  });
  await expectError(res, 400);
});

test("@coupon empty code returns 400", async ({ uniqueIpRequest: request }) => {
  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: "", categoryId: cat.id, amount: cat.price_rupees },
  });
  // code is empty → coupon not found → 400
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

test("@coupon inactive coupon returns 400", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { discountValue: 50, isActive: false });
  couponIds.push(id);
  const db = getTestDb();
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  await expectError(res, 400, "inactive");
});

test("@coupon expired coupon returns 400", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, {
    discountValue: 50,
    expiresAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
  });
  couponIds.push(id);
  const db = getTestDb();
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  await expectError(res, 400, "expired");
});

test("@coupon exhausted coupon (use_count >= max_uses) returns 400", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { discountValue: 50, maxUses: 1 });
  couponIds.push(id);
  const db = getTestDb();
  await db.from("it_run_coupons").update({ use_count: 1 }).eq("id", id);
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  await expectError(res, 400, "usage limit");
});

test("@coupon min_amount not met returns 400", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { discountValue: 50, minAmount: 10000 }); // ₹10,000 min
  couponIds.push(id);
  const db = getTestDb();
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"]; // ₹649 — below min
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  await expectError(res, 400, "minimum");
});

// ── Boundary: exactly 1 remaining use ─────────────────────────────────────────

test("@coupon coupon with 1 remaining use is accepted at validate step", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { discountValue: 50, maxUses: 2 });
  couponIds.push(id);
  const db = getTestDb();
  await db.from("it_run_coupons").update({ use_count: 1 }).eq("id", id); // 1 of 2 used
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code, categoryId: cat.id, amount: cat.price_rupees },
  });
  await expectOk(res);
});

// ── Case-insensitivity ─────────────────────────────────────────────────────────

test("@coupon coupon code is case-insensitive (validate accepts lowercase)", async ({ uniqueIpRequest: request }) => {
  const id = await createTestCoupon(eventId, { code: `UPPER${Date.now()}`, discountValue: 10 });
  couponIds.push(id);
  const db = getTestDb();
  const { data: coupon } = await db.from("it_run_coupons").select("code").eq("id", id).single();

  const cat = categories["5k-fun-run"];
  const res = await request.post(VALIDATE_URL, {
    data: { code: coupon!.code.toLowerCase(), categoryId: cat.id, amount: cat.price_rupees },
  });
  await expectOk(res);
});

// ── Invalid request ────────────────────────────────────────────────────────────

test("@coupon missing categoryId returns 4xx", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(VALIDATE_URL, {
    data: { code: "ANY", amount: 649 },
  });
  await expectError(res, 400, "categoryId");
});

test("@coupon invalid categoryId (fake UUID) returns 404", async ({ uniqueIpRequest: request }) => {
  const res = await request.post(VALIDATE_URL, {
    data: { code: "ANY", categoryId: "00000000-0000-0000-0000-000000000000", amount: 649 },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});
