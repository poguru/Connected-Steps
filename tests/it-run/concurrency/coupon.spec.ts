/**
 * @concurrency @slow
 * Coupon over-redemption race condition tests.
 *
 * Scenario: coupon max_uses = 5.
 * Send 10 simultaneous redemption attempts.
 * Expected: Exactly 5 succeed, 5 are rejected.
 * use_count must never exceed max_uses.
 * use_count must never go negative.
 */
import { test, expect } from "@playwright/test";
import {
  getCategoriesBySlug, getSprintEvent, createTestCoupon, deleteTestCoupon,
  cleanupRegistrations, getTestDb,
} from "../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../helpers/data-factory";

const REGISTER_URL = "/api/it-run/register";
const MAX_USES = 5;
const CONCURRENT = 10;

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
let eventId: string;
let couponId: string;
const createdIds: string[] = [];

test.beforeAll(async () => {
  categories = await getCategoriesBySlug();
  const event = await getSprintEvent();
  eventId = event.id;
  // Create a coupon with limited uses
  couponId = await createTestCoupon(eventId, {
    discountType:  "percent",
    discountValue: 100, // 100% to make registrations free (no payment needed)
    maxUses:       MAX_USES,
    isActive:      true,
  });
});

test.afterAll(async () => {
  await cleanupRegistrations(createdIds);
  await deleteTestCoupon(couponId);
});

test("@concurrency coupon use_count never exceeds max_uses under concurrent load", async ({ request }) => {
  const cat = categories["5k-fun-run"];

  // Fire CONCURRENT simultaneous registration requests using the same coupon
  const requests = Array.from({ length: CONCURRENT }, () =>
    request.post(REGISTER_URL, {
      data: registrationPayload(cat.id, [createAdultParticipant()], couponId),
    }),
  );

  const responses = await Promise.all(requests);
  const statuses  = await Promise.all(responses.map(r => r.status()));

  const succeeded = statuses.filter(s => s === 200);
  const rejected  = statuses.filter(s => s === 409 || s === 400);
  const errors    = statuses.filter(s => s >= 500);

  // Collect created IDs for cleanup
  for (const res of responses) {
    if (res.status() === 200) {
      try {
        const body = await res.json() as { registrationId?: string };
        if (body.registrationId) createdIds.push(body.registrationId);
      } catch { /* skip */ }
    }
  }

  // No server errors
  expect(errors.length, `Server errors: ${errors}`).toBe(0);

  // At most MAX_USES succeed
  expect(succeeded.length, `Expected ≤${MAX_USES} successes, got ${succeeded.length}`).toBeLessThanOrEqual(MAX_USES);

  // Verify DB: use_count matches actual successful registrations
  const db = getTestDb();
  const { data: coupon } = await db
    .from("it_run_coupons")
    .select("use_count, max_uses")
    .eq("id", couponId)
    .single();

  expect(coupon, "Coupon not found after test").toBeTruthy();

  // CRITICAL: use_count must not exceed max_uses
  expect(coupon!.use_count, `use_count ${coupon!.use_count} exceeds max_uses ${coupon!.max_uses}`).toBeLessThanOrEqual(MAX_USES);

  // use_count must not be negative
  expect(coupon!.use_count).toBeGreaterThanOrEqual(0);
});

test("@concurrency coupon use_count matches DB registration count", async () => {
  const db = getTestDb();

  const { data: coupon } = await db
    .from("it_run_coupons")
    .select("use_count")
    .eq("id", couponId)
    .single();

  // Count actual coupon_uses records
  const { count } = await db
    .from("it_run_coupon_uses")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", couponId);

  // use_count should match actual use records
  expect(coupon?.use_count).toBe(count ?? 0);
});
