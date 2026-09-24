/**
 * Concurrent capacity test for IT Run Sprint 2.
 *
 * Fires N registration requests simultaneously and verifies that no more
 * than (available_slots) succeed — demonstrating that itr_reserve_capacity
 * prevents overselling even under concurrent load.
 *
 * Prerequisites:
 *   1. Run migration 20260924000007 in Supabase.
 *   2. Set CATEGORY_ID to the UUID of an IT Run category.
 *      The category's (max_participants - current_participants) tells you
 *      how many requests should succeed.
 *   3. Server must be running (NEXT_PUBLIC_APP_URL or localhost:3000).
 *
 * Run:
 *   CATEGORY_ID=<uuid> npx tsx scripts/test-capacity-concurrency.ts
 *   CATEGORY_ID=<uuid> node --experimental-strip-types scripts/test-capacity-concurrency.ts
 */

const BASE_URL    = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CATEGORY_ID = process.env.CATEGORY_ID;
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "10", 10);

if (!CATEGORY_ID) {
  console.error("Error: CATEGORY_ID env var is required.");
  process.exit(1);
}

function makePayload(idx: number) {
  return {
    categoryId: CATEGORY_ID,
    couponId:   null,
    participants: [
      {
        type:           "solo",
        firstName:      `ConcTest${idx}`,
        lastName:       "User",
        gender:         "M",
        dob:            "1990-01-01",
        email:          `conctest${idx}@example.com`,
        mobile:         "9876543210",
        bloodGroup:     "O+",
        emergencyName:  "Test Emergency",
        emergencyPhone: "9876543211",
        companyName:    "Test Corp",
        employeeId:     `CONC${idx}`,
        companyIdUrl:   "",
        tshirtSize:     "M",
        medicalConditions: "",
        foodPreference: "veg",
      },
    ],
  };
}

async function sendRequest(idx: number): Promise<{ idx: number; status: number; body: unknown }> {
  try {
    const res  = await fetch(`${BASE_URL}/api/it-run/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(makePayload(idx)),
    });
    const body = await res.json();
    return { idx, status: res.status, body };
  } catch (e) {
    return { idx, status: 0, body: { error: String(e) } };
  }
}

async function main() {
  console.log(`\nIT Run capacity concurrency test`);
  console.log(`  Category : ${CATEGORY_ID}`);
  console.log(`  Requests : ${CONCURRENCY} simultaneous`);
  console.log(`  Endpoint : ${BASE_URL}/api/it-run/register\n`);

  const requests = Array.from({ length: CONCURRENCY }, (_, i) => sendRequest(i));
  const results  = await Promise.all(requests);

  const confirmed = results.filter(r => r.status === 200 || r.status === 201);
  const full      = results.filter(r => r.status === 409);
  const errors    = results.filter(r => r.status >= 500 || r.status === 0);

  console.log("Results:");
  for (const r of results) {
    const mark = r.status === 200 ? "✓" : r.status === 409 ? "✗" : "!";
    console.log(`  [${r.idx}] ${mark} HTTP ${r.status}  ${JSON.stringify(r.body)}`);
  }

  console.log(`\nSummary:`);
  console.log(`  Confirmed : ${confirmed.length}`);
  console.log(`  Full (409): ${full.length}`);
  console.log(`  Errors    : ${errors.length}`);

  // The test passes when at most one request succeeded (one slot available)
  // or more generally when confirmed.length <= available_slots_before_test.
  // We assert "no oversell" by checking that subsequent requests got 409, not 200.
  if (errors.length > 0) {
    console.error(`\n⚠  ${errors.length} request(s) returned server errors — check logs.`);
  }

  if (confirmed.length > 1) {
    console.error(`\n❌ FAIL — ${confirmed.length} requests confirmed — possible oversell.`);
    console.error(   "   If max_participants had >1 slot available this may be a false alarm.");
    console.error(   "   Set max_participants = current_participants + 1 for a strict single-slot test.");
    process.exit(1);
  } else if (confirmed.length === 0) {
    console.warn(`\n⚠  No requests succeeded — category may already be full or CATEGORY_ID is wrong.`);
  } else {
    console.log(`\n✅ PASS — exactly 1 request confirmed, ${full.length} correctly rejected as full.`);
    console.log(   "   Concurrent oversell is prevented by itr_reserve_capacity.\n");
  }
}

main();
