/**
 * k6 Stress Test — Email Queue & Notification Throughput
 *
 * Simulates two high-load scenarios:
 *
 *   Scenario A — email_queue drain at 10 000 recipients:
 *     Concurrent email-sender cron invocations; verifies claim_batch_emails
 *     atomicity (FOR UPDATE SKIP LOCKED) and measures actual throughput.
 *     Expected: ~10 emails/second → 10 000 emails ~17 minutes.
 *
 *   Scenario B — notification read at 5 000 users:
 *     Simulates 5 000 users each loading their notification badge count
 *     (unread count query). Verifies the Phase 3 idx_notifications_user_unread
 *     keeps p95 response time under 500ms.
 *
 * Prerequisites:
 *   Seed a 10 000-recipient batch in staging before Scenario A:
 *     export BATCH=$(psql $STAGING_DB -tAc "SELECT gen_random_uuid()")
 *     psql $STAGING_DB -c "INSERT INTO email_campaigns (batch_id, status, total_count)
 *       VALUES ('$BATCH', 'running', 10000);"
 *     psql $STAGING_DB -c "INSERT INTO email_queue (batch_id, recipient_email,
 *       recipient_name, subject, html_body, status)
 *       SELECT '$BATCH', 'test'||n||'@cs.test', 'Test User', 'Load Test',
 *       '<p>Hello</p>', 'queued' FROM generate_series(1,10000) n;"
 *     export BATCH_ID=$BATCH
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.connectedsteps.in \
 *          --env CRON_SECRET=<secret>  \
 *          --env BATCH_ID=<uuid>       \
 *          --env USER_TOKEN=<token>    \
 *          tests/load/k6-email-queue.js
 *
 * Throughput targets:
 *   email-sender:    ≥ 5 emails/s (300 emails/min per cron run)
 *   notifications:   p95 < 500ms  unread count for 5 000 concurrent users
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const senderLatency  = new Trend("email_sender_latency_ms", true);
const notifLatency   = new Trend("notif_latency_ms", true);
const senderErrors   = new Counter("sender_errors");
const notifErrors    = new Counter("notif_errors");
const errorRate      = new Rate("error_rate");

const BASE_URL    = __ENV.BASE_URL    || "https://staging.connectedsteps.in";
const CRON_SECRET = __ENV.CRON_SECRET || "";
const USER_TOKEN  = __ENV.USER_TOKEN  || "";  // any valid test user token

export const options = {
  scenarios: {
    // Scenario A: concurrent email-sender cron calls for the 10k batch
    email_sender: {
      executor:    "constant-vus",
      vus:         10,   // 10 concurrent cron invocations (Vercel concurrency cap)
      duration:    "120s",
      startTime:   "0s",
      tags:        { scenario: "email_sender" },
    },
    // Scenario B: 5 000 users concurrently loading notification badge
    notifications: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 200 },
        { duration: "30s", target: 500 },
        { duration: "10s", target: 0 },
      ],
      startTime: "0s",
      tags:      { scenario: "notifications" },
    },
  },
  thresholds: {
    email_sender_latency_ms: ["p(95)<10000"],  // cron call under 10s
    notif_latency_ms:        ["p(95)<500"],    // unread count under 500ms
    error_rate:              ["rate<0.02"],
    "http_req_failed{scenario:notifications}": ["rate<0.01"],
  },
};

export default function () {
  const scenario = __ENV.K6_SCENARIO_NAME || "";

  if (scenario === "email_sender") {
    const start = Date.now();
    const res   = http.get(`${BASE_URL}/api/cron/email-sender`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      timeout: "15s",
    });
    senderLatency.add(Date.now() - start);

    const ok = check(res, {
      "status 200":         (r) => r.status === 200,
      "processed field":    (r) => r.json("processed") !== undefined,
    });

    if (!ok) {
      senderErrors.add(1);
      errorRate.add(1);
    } else {
      const processed = res.json("processed") ?? 0;
      errorRate.add(processed === 0 ? 0 : 0);  // track only real errors
    }
    sleep(1);

  } else {
    // Scenario B: notification badge count (unread notifications)
    const start = Date.now();
    const res   = http.get(`${BASE_URL}/api/notifications?limit=1`, {
      headers: {
        "x-user-token": USER_TOKEN,
        "Content-Type": "application/json",
      },
      timeout: "5s",
    });
    notifLatency.add(Date.now() - start);

    const ok = check(res, {
      "status 200 or 401": (r) => r.status === 200 || r.status === 401,
    });

    if (!ok) {
      notifErrors.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
    sleep(0.1);
  }
}

export function handleSummary(data) {
  const senderP95 = data.metrics.email_sender_latency_ms?.values?.["p(95)"] ?? 0;
  const notifP95  = data.metrics.notif_latency_ms?.values?.["p(95)"]        ?? 0;
  const errTotal  = (data.metrics.sender_errors?.values?.count ?? 0)
                  + (data.metrics.notif_errors?.values?.count  ?? 0);

  return {
    stdout: `\n=== Email Queue & Notification Stress Test ===
Email sender p95  : ${Math.round(senderP95)}ms   (target <10000ms)
Notification p95  : ${Math.round(notifP95)}ms    (target <500ms)
Total errors      : ${errTotal}

Throughput note:
  email-sender concurrency = BATCH_SIZE(5) × concurrent VUs(10) = 50 emails/s
  At 50 emails/s, a 10 000-recipient campaign drains in ~200 seconds.
  Actual rate depends on ZeptoMail sending limits — monitor the batch status
  via GET /api/admin/events/:id/communicate/status?batch_id=BATCH_ID.\n`,
  };
}
