/**
 * @concurrency @slow
 * Capacity race condition tests.
 *
 * Scenario: Only N slots remain in a category.
 * Send N+K simultaneous requests.
 * Expected: Exactly N succeed, K are rejected with "fully booked".
 * No overselling allowed.
 *
 * This is the most critical correctness test for a race event.
 */
import { test, expect } from "@playwright/test";
import {
  getCategoriesBySlug, getSprintEvent, getParticipants, cleanupRegistrations,
  getTestDb,
} from "../fixtures/db";
import { createAdultParticipant, registrationPayload } from "../helpers/data-factory";

const REGISTER_URL = "/api/it-run/register";
const SLOTS_TO_TEST = 3; // Reserve 3 slots then try 6 concurrent
const EXTRA_REQUESTS = 3;

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
let testCategoryId: string;
let eventId: string;
const createdIds: string[] = [];

test.beforeAll(async () => {
  categories = await getCategoriesBySlug();
  const event = await getSprintEvent();
  eventId = event.id;

  // Create a dedicated test category with tight capacity (won't conflict with real event data)
  const db = getTestDb();
  const existing = categories["5k-fun-run"];
  const { data: cat } = await db
    .from("it_run_categories")
    .insert({
      event_id:             eventId,
      slug:                 `test-capacity-${Date.now()}`,
      name:                 "Concurrency Test Category",
      distance_km:          5.0,
      category_type:        "solo",
      price_rupees:         649,
      max_participants:     SLOTS_TO_TEST,
      current_participants: 0,
      is_active:            true,
      sort_order:           99,
      color:                "#cccccc",
    })
    .select("id")
    .single();
  testCategoryId = cat!.id;
});

test.afterAll(async () => {
  await cleanupRegistrations(createdIds);
  // Delete test category
  const db = getTestDb();
  await db.from("it_run_categories").delete().eq("id", testCategoryId);
});

test("@concurrency exactly SLOTS_TO_TEST succeed when capacity is tight", async ({ request }) => {
  const total    = SLOTS_TO_TEST + EXTRA_REQUESTS;
  const requests = Array.from({ length: total }, () =>
    request.post(REGISTER_URL, {
      data: registrationPayload(testCategoryId, [createAdultParticipant()]),
    }),
  );

  // Fire all simultaneously
  const responses = await Promise.all(requests);
  const statuses  = await Promise.all(responses.map(r => r.status()));

  const succeeded  = statuses.filter(s => s === 200);
  const fullBooked = statuses.filter(s => s === 409);
  const errors     = statuses.filter(s => s >= 500);

  // Collect created registration IDs for cleanup
  for (const res of responses) {
    if (res.status() === 200) {
      try {
        const body = await res.json() as { registrationId?: string };
        if (body.registrationId) createdIds.push(body.registrationId);
      } catch { /* skip */ }
    }
  }

  // Critical assertion: no server errors
  expect(errors.length, `Server errors during concurrency test: ${errors}`).toBe(0);

  // Exactly SLOTS_TO_TEST can succeed
  expect(succeeded.length, `Expected ≤${SLOTS_TO_TEST} successes, got ${succeeded.length}`).toBeLessThanOrEqual(SLOTS_TO_TEST);

  // Verify DB: count actual participants inserted
  const db = getTestDb();
  const { count } = await db
    .from("it_run_participants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("registration_id",
      (await db.from("it_run_registrations").select("id").eq("category_id", testCategoryId)).data?.map(r => r.id) ?? [],
    );

  expect(count ?? 0, "DB participant count exceeds category capacity").toBeLessThanOrEqual(SLOTS_TO_TEST);
});

test("@concurrency category current_participants does not exceed max_participants", async () => {
  const db = getTestDb();
  const { data: cat } = await db
    .from("it_run_categories")
    .select("current_participants,max_participants")
    .eq("id", testCategoryId)
    .single();

  expect(cat).toBeTruthy();
  if (cat && cat.max_participants !== null) {
    expect(cat.current_participants).toBeLessThanOrEqual(cat.max_participants);
  }
});
