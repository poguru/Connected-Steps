/**
 * k6 Load Test — Leaderboard (public read-heavy endpoint)
 *
 * Simulates 200 concurrent users hitting the leaderboard API.
 * This is a cache-layer test: first request is a MISS (DB hit),
 * subsequent requests within TTL should be HITs (Redis).
 *
 * Usage:
 *   k6 run --env BASE_URL=https://www.connectedsteps.in \
 *          tests/load/k6-leaderboard.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const cacheHits   = new Counter("cache_hits");
const cacheMisses = new Counter("cache_misses");
const errorRate   = new Rate("error_rate");

export const options = {
  scenarios: {
    leaderboard_read: {
      executor: "constant-vus",
      vus:      200,
      duration: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"],   // Cache hits should be < 200ms
    error_rate:        ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "https://www.connectedsteps.in";

export default function () {
  const res = http.get(`${BASE_URL}/api/leaderboard`, {
    headers: { "Content-Type": "application/json" },
    timeout: "5s",
  });

  const ok = check(res, {
    "status 200":    (r) => r.status === 200,
    "has entries":   (r) => !!(r.json() && r.json().entries),
  });

  if (ok) {
    const cacheHeader = res.headers["X-Cache"] || res.headers["x-cache"];
    if (cacheHeader === "HIT")  cacheHits.add(1);
    else                        cacheMisses.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
  }

  sleep(0.2);
}
