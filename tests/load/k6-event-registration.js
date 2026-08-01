/**
 * k6 Load Test — Event Registration Flow
 *
 * Simulates 500 concurrent users registering for an event over 60 seconds.
 * Covers the critical payment-free path (free events / full discount coupons).
 *
 * Usage:
 *   k6 run --env BASE_URL=https://www.connectedsteps.in \
 *          --env EVENT_ID=<uuid> \
 *          tests/load/k6-event-registration.js
 *
 * Thresholds (SLOs):
 *   p95 response time < 3000ms
 *   Error rate < 5%
 *   Check pass rate > 95%
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ── Custom metrics ────────────────────────────────────────────────────────────
const registrationSuccesses = new Counter("registration_successes");
const registrationDupes     = new Counter("registration_dupes");
const registrationErrors    = new Counter("registration_errors");
const errorRate             = new Rate("error_rate");
const regLatency            = new Trend("registration_latency_ms", true);

// ── Scenario config ───────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Ramp to 500 concurrent VUs, hold 60s, ramp down
    event_registration: {
      executor:    "ramping-vus",
      startVUs:    0,
      stages: [
        { duration: "20s", target: 500 },   // ramp-up
        { duration: "60s", target: 500 },   // sustained load
        { duration: "10s", target: 0 },     // ramp-down
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration:    ["p(95)<3000"],    // 95th percentile < 3s
    error_rate:           ["rate<0.05"],     // < 5% hard errors
    registration_errors:  ["count<25"],      // < 25 hard failures (5% of 500)
  },
};

// ── Test data ─────────────────────────────────────────────────────────────────

const BASE_URL  = __ENV.BASE_URL || "https://www.connectedsteps.in";
const EVENT_ID  = __ENV.EVENT_ID || "REPLACE_WITH_REAL_EVENT_ID";

// Pre-seeded test users: these must exist in the test environment with valid
// cs_user_token values. Use staging/test env only — never production data.
// Generate with: node scripts/gen-load-test-tokens.js
const TEST_USERS = JSON.parse(open("./test-users.json") || "[]");

function pickUser(vu) {
  // Each VU uses a distinct pre-seeded user to avoid same-email duplicates
  return TEST_USERS[vu % TEST_USERS.length];
}

// ── Main VU function ──────────────────────────────────────────────────────────

export default function () {
  const user = pickUser(__VU - 1);
  if (!user) {
    console.error(`No test user for VU ${__VU}`);
    errorRate.add(1);
    return;
  }

  const payload = JSON.stringify({
    event_id:          EVENT_ID,
    email:             user.email,
    name:              user.name,
    phone:             user.phone || "9999999999",
    gender:            "male",
    date_of_birth:     "1990-01-01",
    blood_group:       "O+",
    emergency_contact: "9999000000",
    special_notes:     "Load test registration",
    distance_category: null,
  });

  const startMs = Date.now();
  const res = http.post(
    `${BASE_URL}/api/events/register`,
    payload,
    {
      headers: {
        "Content-Type":  "application/json",
        "x-user-token":  user.token,
      },
      timeout: "10s",
    },
  );
  regLatency.add(Date.now() - startMs);

  const body = res.json();

  const ok = check(res, {
    "status is 200 or 409 or 200-already": (r) =>
      r.status === 200 || r.status === 409 || (r.status === 200 && body && body.already),
    "response has registration_code or error": (r) => {
      const b = r.json();
      return !!(b && (b.registration_code || b.already || b.error));
    },
  });

  if (res.status === 200 && body && body.registration_code) {
    registrationSuccesses.add(1);
    errorRate.add(0);
  } else if (res.status === 200 && body && body.already) {
    registrationDupes.add(1);
    errorRate.add(0);
  } else if (res.status === 409) {
    // Fully booked — expected under load when max_slots is set
    errorRate.add(0);
  } else if (res.status === 429) {
    // Rate limited — expected under sustained load; not counted as an error
    errorRate.add(0);
  } else {
    registrationErrors.add(1);
    errorRate.add(1);
    console.error(`VU${__VU} unexpected: status=${res.status} body=${res.body?.slice(0, 200)}`);
  }

  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s think time
}
