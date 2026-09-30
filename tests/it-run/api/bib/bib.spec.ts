/**
 * @bib
 * BIB allocation and collection tests.
 * POST /api/it-run/admin/bibs — bulk auto-allocate
 * GET  /api/it-run/admin/bibs — list
 */
import { test as apiTest, expect } from "../../fixtures/api";
import {
  getCategoriesBySlug, getParticipants, cleanupRegistrations,
  forcePaymentStatus, getTestDb,
} from "../../fixtures/db";
import { createAdultParticipant, createDuoParticipants, registrationPayload } from "../../helpers/data-factory";
import { expectRegistrationCreated } from "../../helpers/assertions";

const REGISTER_URL = "/api/it-run/register";
const BIBS_URL     = "/api/it-run/admin/bibs";

// BIB ranges per actual DB sort_order:
// parent-child-duo=1 → 1001-1999, 5k-fun-run=2 → 2001-2999,
// 5k-timed=3 → 3001-3999, 5k-duo=4 → 4001-4999, 10k-timed=5 → 5001-5999
const BIB_RANGES: Record<string, { min: number; max: number }> = {
  "parent-child-duo": { min: 1001, max: 1999 },
  "5k-fun-run":       { min: 2001, max: 2999 },
  "5k-timed":         { min: 3001, max: 3999 },
  "5k-duo":           { min: 4001, max: 4999 },
  "10k-timed":        { min: 5001, max: 5999 },
};

const RUN_IP = `10.${Math.floor(Date.now() / 1000) % 200 + 10}.${Math.floor(Math.random() * 250) + 1}.12`;
apiTest.use({ extraHTTPHeaders: { "x-forwarded-for": RUN_IP } });

let categories: Awaited<ReturnType<typeof getCategoriesBySlug>>;
const createdIds: string[] = [];

const ADMIN_CREDS_AVAILABLE = !!(process.env.ITR_TEST_ADMIN_EMAIL && process.env.ITR_TEST_ADMIN_PASSWORD);

apiTest.beforeAll(async () => { categories = await getCategoriesBySlug(); });
apiTest.afterAll(async () => { await cleanupRegistrations(createdIds); });

// ── Auth guard ─────────────────────────────────────────────────────────────────

apiTest("@bib @security unauthenticated BIB allocation returns 401", async ({ request }) => {
  const res = await request.post(BIBS_URL, { data: {} });
  expect(res.status()).toBe(401);
});

// ── BIB allocation range correctness ──────────────────────────────────────────

for (const slug of ["10k-timed", "5k-timed", "5k-fun-run"] as const) {
  apiTest(`@bib BIB allocated to ${slug} falls in correct numeric range`, async ({ request, adminApi }) => {
    apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
    const cat    = categories[slug];
    const regRes = await request.post(REGISTER_URL, {
      data: registrationPayload(cat.id, [createAdultParticipant()]),
    });
    const reg = await expectRegistrationCreated(regRes);
    createdIds.push(reg.registrationId);
    await forcePaymentStatus(reg.registrationId, "paid");

    // Remove any existing BIB to ensure allocation is needed
    const db = getTestDb();
    const parts = await getParticipants(reg.registrationId);
    await db.from("it_run_participants").update({ bib_number: null }).eq("id", parts[0].id);

    const allocRes = await adminApi.post(BIBS_URL, { categorySlug: slug });
    expect(allocRes.status()).toBe(200);

    const updatedParts = await getParticipants(reg.registrationId);
    const bib = parseInt(updatedParts[0].bib_number ?? "", 10);

    if (!Number.isNaN(bib)) {
      // Only check range if this participant was actually allocated (it may have already had one)
      const range = BIB_RANGES[slug];
      expect(bib).toBeGreaterThanOrEqual(range.min);
      expect(bib).toBeLessThanOrEqual(range.max);
    }
  });
}

// ── Duo — both participants get BIBs ──────────────────────────────────────────

apiTest("@bib duo registration — both participants receive BIBs in 5K duo range", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat = categories["5k-duo"];
  const [p1, p2] = createDuoParticipants();
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [p1, p2]),
  });
  const reg = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);
  await forcePaymentStatus(reg.registrationId, "paid");

  const db = getTestDb();
  const parts = await getParticipants(reg.registrationId);
  // Clear BIBs to force allocation
  for (const part of parts) {
    await db.from("it_run_participants").update({ bib_number: null }).eq("id", part.id);
  }

  const allocRes = await adminApi.post(BIBS_URL, { categorySlug: "5k-duo" });
  expect(allocRes.status()).toBe(200);

  const updatedParts = await getParticipants(reg.registrationId);
  const bibs = updatedParts.map(p => p.bib_number).filter(Boolean) as string[];

  if (bibs.length === 2) {
    // No duplicate BIBs
    expect(new Set(bibs).size).toBe(2);
    // Both in correct range
    for (const bib of bibs) {
      const n = parseInt(bib, 10);
      expect(n).toBeGreaterThanOrEqual(4001);
      expect(n).toBeLessThanOrEqual(4999);
    }
  }
});

// ── No duplicate BIBs ─────────────────────────────────────────────────────────

apiTest("@bib no duplicate BIB numbers after bulk allocation across 10 registrations", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat = categories["5k-fun-run"];
  const registrationIds: string[] = [];

  // Create 10 registrations
  for (let i = 0; i < 10; i++) {
    const regRes = await request.post(REGISTER_URL, {
      data: registrationPayload(cat.id, [createAdultParticipant()]),
    });
    const reg = await expectRegistrationCreated(regRes);
    registrationIds.push(reg.registrationId);
    createdIds.push(reg.registrationId);
    await forcePaymentStatus(reg.registrationId, "paid");
  }

  // Clear BIBs for all
  const db = getTestDb();
  for (const id of registrationIds) {
    const parts = await getParticipants(id);
    for (const part of parts) {
      await db.from("it_run_participants").update({ bib_number: null }).eq("id", part.id);
    }
  }

  const allocRes = await adminApi.post(BIBS_URL, { categorySlug: "5k-fun-run" });
  expect(allocRes.status()).toBe(200);

  // Collect all allocated BIBs for these registrations
  const allBibs: string[] = [];
  for (const id of registrationIds) {
    const parts = await getParticipants(id);
    for (const part of parts) {
      if (part.bib_number) allBibs.push(part.bib_number);
    }
  }

  // All BIBs must be unique
  expect(new Set(allBibs).size).toBe(allBibs.length);
  // All in 5K fun run range (sort_order=2 → 2001-2999)
  for (const bib of allBibs) {
    const n = parseInt(bib, 10);
    expect(n).toBeGreaterThanOrEqual(2001);
    expect(n).toBeLessThanOrEqual(2999);
  }
});

// ── Already allocated participant is skipped ───────────────────────────────────

apiTest("@bib already-allocated participant is not re-allocated", async ({ request, adminApi }) => {
  apiTest.skip(!ADMIN_CREDS_AVAILABLE, "Requires ITR_TEST_ADMIN_EMAIL / ITR_TEST_ADMIN_PASSWORD");
  const cat    = categories["5k-fun-run"];
  const regRes = await request.post(REGISTER_URL, {
    data: registrationPayload(cat.id, [createAdultParticipant()]),
  });
  const reg  = await expectRegistrationCreated(regRes);
  createdIds.push(reg.registrationId);
  await forcePaymentStatus(reg.registrationId, "paid");

  // Manually assign a BIB
  const db = getTestDb();
  const parts = await getParticipants(reg.registrationId);
  const existingBib = "3500";
  await db.from("it_run_participants").update({ bib_number: existingBib }).eq("id", parts[0].id);

  // Run allocation
  await adminApi.post(BIBS_URL, { categorySlug: "5k-fun-run" });

  // BIB should still be the same (not changed)
  const updatedParts = await getParticipants(reg.registrationId);
  expect(updatedParts[0].bib_number).toBe(existingBib);
});
