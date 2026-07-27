/**
 * k6 load test — Participant dashboard + leaderboard read paths
 *
 * Simulates participants refreshing their dashboard and leaderboard during an event.
 * These are the highest-traffic read endpoints — must stay fast under 500 concurrent users.
 *
 * Run:
 *   k6 run load-tests/k6-dashboard.js \
 *     --env BASE_URL=https://your-app.vercel.app \
 *     --env USER_TOKEN=<token>
 *
 * Thresholds:
 *   - Dashboard p95 < 2000 ms
 *   - Leaderboard p95 < 2000 ms
 *   - Events list p95 < 1000 ms (small payload, should be fast)
 *   - Error rate < 2%
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend } from "k6/metrics";

export const options = {
  stages: [
    { duration: "30s", target: 100 },  // ramp to 100 users (normal load)
    { duration: "2m",  target: 500 },  // sustain 500 concurrent users (target)
    { duration: "30s", target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration:         ["p(95)<2000"],
    http_req_failed:           ["rate<0.02"],
    "dashboard_duration":      ["p(95)<2000"],
    "leaderboard_duration":    ["p(95)<2000"],
    "events_list_duration":    ["p(95)<1000"],
  },
};

const dashboardDuration   = new Trend("dashboard_duration",   true);
const leaderboardDuration = new Trend("leaderboard_duration", true);
const eventsListDuration  = new Trend("events_list_duration", true);

const BASE_URL   = __ENV.BASE_URL   || "http://localhost:3000";
const USER_TOKEN = __ENV.USER_TOKEN || "";

export default function () {
  const headers = USER_TOKEN
    ? { "x-user-token": USER_TOKEN }
    : {};

  // ── Events list (unauthenticated — public endpoint) ─────────────────────────
  group("events_list", () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/events`, { headers });
    eventsListDuration.add(Date.now() - start);
    check(res, {
      "events: 200 or 404": (r) => r.status === 200 || r.status === 404,
    });
  });

  sleep(0.5);

  // ── Leaderboard (public) ─────────────────────────────────────────────────────
  group("leaderboard", () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/leaderboard?limit=50`, { headers });
    leaderboardDuration.add(Date.now() - start);
    check(res, {
      "leaderboard: 200 or 404": (r) => r.status === 200 || r.status === 404,
      "leaderboard: json":       (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
    });
  });

  sleep(0.5);

  // ── My registrations (authenticated) ────────────────────────────────────────
  if (USER_TOKEN) {
    group("dashboard", () => {
      const start = Date.now();
      const res = http.get(`${BASE_URL}/api/events/my-registrations`, { headers: { "x-user-token": USER_TOKEN } });
      dashboardDuration.add(Date.now() - start);
      check(res, {
        "dashboard: 200":         (r) => r.status === 200,
        "dashboard: has registrations": (r) => {
          try { return Array.isArray(JSON.parse(r.body).registrations); } catch { return false; }
        },
      });
    });
  }

  // ── Health check (monitoring systems simulate this) ─────────────────────────
  group("health", () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, {
      "health: 200 or 503": (r) => r.status === 200 || r.status === 503,
    });
  });

  sleep(1);
}
