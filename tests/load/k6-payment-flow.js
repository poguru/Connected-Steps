/**
 * k6 Load Test — Payment Order Creation
 *
 * Simulates 100 concurrent users creating Razorpay payment orders.
 * Does NOT actually submit payments (no real money) — tests the order
 * creation API which is the bottleneck before payment redirect.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://www.connectedsteps.in \
 *          --env EVENT_ID=<uuid> \
 *          tests/load/k6-payment-flow.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const orderSuccesses = new Counter("order_successes");
const orderErrors    = new Counter("order_errors");
const errorRate      = new Rate("error_rate");
const orderLatency   = new Trend("order_latency_ms", true);

export const options = {
  scenarios: {
    payment_orders: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 100 },
        { duration: "30s", target: 100 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<5000"],   // Razorpay API call, allow 5s
    error_rate:        ["rate<0.02"],    // < 2% errors for payment flow
  },
};

const BASE_URL  = __ENV.BASE_URL || "https://www.connectedsteps.in";
const EVENT_ID  = __ENV.EVENT_ID || "REPLACE_WITH_REAL_EVENT_ID";

const TEST_USERS = JSON.parse(open("./test-users.json") || "[]");

export default function () {
  const user = TEST_USERS[(__VU - 1) % TEST_USERS.length];
  if (!user) return;

  const startMs = Date.now();
  const res = http.post(
    `${BASE_URL}/api/payment/create-order`,
    JSON.stringify({
      type:       "event",
      event_id:   EVENT_ID,
      email:      user.email,
      amount:     500,    // ₹500 test amount in rupees
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-user-token": user.token,
      },
      timeout: "15s",
    },
  );
  orderLatency.add(Date.now() - startMs);

  const ok = check(res, {
    "order created (200)":     (r) => r.status === 200,
    "has razorpay order_id":   (r) => !!(r.json() && r.json().order_id),
  });

  if (ok && res.status === 200) {
    orderSuccesses.add(1);
    errorRate.add(0);
  } else {
    orderErrors.add(1);
    errorRate.add(1);
  }

  sleep(1);
}
