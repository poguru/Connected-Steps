/**
 * k6 load test — Volunteer check-in and distribution services
 *
 * Simulates volunteer stations scanning QR codes during a race event.
 * Target: 2000 participants / hour = ~34 scans/min = sustainable at low VU count.
 *
 * Run:
 *   k6 run load-tests/k6-checkin.js \
 *     --env BASE_URL=https://your-app.vercel.app \
 *     --env ADMIN_COOKIE=cs_admin_session=<value> \
 *     --env EVENT_ID=<uuid>
 *
 * Required env vars:
 *   BASE_URL      Target deployment URL
 *   ADMIN_COOKIE  Valid cs_admin_session cookie (or x-coach-token)
 *   EVENT_ID      UUID of the event being scanned
 *   QR_TOKEN      (Optional) A specific QR token to scan; random strings used otherwise
 *
 * Thresholds:
 *   - p95 check-in latency < 1500 ms (on-site latency critical — volunteer sees delay)
 *   - error rate < 1%
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

export const options = {
  scenarios: {
    event_checkin: {
      executor:    "constant-arrival-rate",
      rate:        10,            // 10 scans per second at peak
      timeUnit:    "1s",
      duration:    "3m",
      preAllocatedVUs: 20,
      maxVUs:      50,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1500"],
    http_req_failed:   ["rate<0.01"],
    "checkin_latency": ["p(95)<1500"],
    "checkin_errors":  ["rate<0.05"],
  },
};

const checkinLatency = new Trend("checkin_latency", true);
const checkinErrors  = new Rate("checkin_errors");

const BASE_URL    = __ENV.BASE_URL    || "http://localhost:3000";
const ADMIN_COOKIE = __ENV.ADMIN_COOKIE || "";
const EVENT_ID    = __ENV.EVENT_ID    || "";
const QR_TOKEN    = __ENV.QR_TOKEN    || null;

function randomQRToken() {
  // Generates an invalid-format token to exercise the rejection path
  return `invalid-qr-${Math.random().toString(36).slice(2, 16)}`;
}

export default function () {
  if (!ADMIN_COOKIE || !EVENT_ID) {
    console.error("ADMIN_COOKIE and EVENT_ID are required");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    "Cookie":       ADMIN_COOKIE,
  };

  const token = QR_TOKEN ?? randomQRToken();

  // ── Check-in scan ────────────────────────────────────────────────────────────
  const start  = Date.now();
  const res    = http.post(
    `${BASE_URL}/api/events/check-in`,
    JSON.stringify({ token, event_id: EVENT_ID }),
    { headers },
  );
  const elapsed = Date.now() - start;

  checkinLatency.add(elapsed);

  const ok = check(res, {
    "checkin: no 500":   (r) => r.status !== 500,
    "checkin: has body": (r) => r.body !== null && r.body.length > 0,
    "checkin: json":     (r) => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    },
  });

  if (!ok || res.status >= 500) checkinErrors.add(1);

  sleep(0.1);  // 100 ms between scans per VU — simulates realistic operator pace
}
