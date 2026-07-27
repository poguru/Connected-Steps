/**
 * k6 load test — Event registration + payment verification flow
 *
 * Simulates concurrent participants registering for a free event.
 * Run:  k6 run load-tests/k6-registration.js --env BASE_URL=https://your-app.vercel.app
 *       k6 run load-tests/k6-registration.js --env BASE_URL=http://localhost:3000 --vus 10 --duration 30s
 *
 * Required env vars:
 *   BASE_URL       Target deployment URL (no trailing slash)
 *   USER_TOKEN     Valid x-user-token from a test account
 *   EVENT_ID       UUID of a free published event to register against
 *
 * Thresholds (fail build if exceeded):
 *   - p95 response time < 3000 ms
 *   - error rate < 5%
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// ── Configuration ──────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: "30s", target: 20 },   // ramp up to 20 concurrent users
    { duration: "2m",  target: 50 },   // sustain 50 VUs
    { duration: "30s", target: 100 },  // spike to 100 VUs (stress)
    { duration: "30s", target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration:                   ["p(95)<3000"],
    http_req_failed:                     ["rate<0.05"],
    "registration_success":              ["count>0"],
    "registration_duration":             ["p(95)<3000"],
  },
};

const registrationSuccess  = new Counter("registration_success");
const registrationDuration = new Trend("registration_duration", true);

const BASE_URL    = __ENV.BASE_URL    || "http://localhost:3000";
const USER_TOKEN  = __ENV.USER_TOKEN  || "";
const EVENT_ID    = __ENV.EVENT_ID    || "";

// ── Helpers ────────────────────────────────────────────────────────────────────

function uniqueEmail() {
  return `load-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@connectedsteps.test`;
}

function randomPhone() {
  return `9${Math.floor(100000000 + Math.random() * 900000000)}`;
}

// ── Main VU function ───────────────────────────────────────────────────────────

export default function () {
  if (!USER_TOKEN || !EVENT_ID) {
    console.error("USER_TOKEN and EVENT_ID env vars are required");
    return;
  }

  const email = uniqueEmail();
  const phone = randomPhone();

  const headers = {
    "Content-Type":  "application/json",
    "x-user-token":  USER_TOKEN,
  };

  // ── Step 1: Register for free event ─────────────────────────────────────────
  const regStart = Date.now();
  const regRes = http.post(
    `${BASE_URL}/api/events/register`,
    JSON.stringify({
      event_id:          EVENT_ID,
      email,
      name:              "Load Test User",
      phone,
      gender:            "male",
      date_of_birth:     "1990-06-15",
      blood_group:       "O+",
      emergency_contact: randomPhone(),
      special_notes:     "k6 load test",
    }),
    { headers },
  );

  const regOk = check(regRes, {
    "register: status 200":              (r) => r.status === 200,
    "register: success or already flag": (r) => {
      try {
        const b = JSON.parse(r.body);
        return b.success === true || b.already === true;
      } catch { return false; }
    },
  });

  registrationDuration.add(Date.now() - regStart);
  if (regOk) registrationSuccess.add(1);

  sleep(1);

  // ── Step 2: Fetch my-registrations ───────────────────────────────────────────
  const listRes = http.get(`${BASE_URL}/api/events/my-registrations`, { headers });
  check(listRes, {
    "my-registrations: status 200": (r) => r.status === 200,
    "my-registrations: array":      (r) => {
      try { return Array.isArray(JSON.parse(r.body).registrations); } catch { return false; }
    },
  });

  sleep(2);
}
