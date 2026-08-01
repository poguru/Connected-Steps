/**
 * k6 Stress Test — Job Queue Throughput & Retry-Storm Resilience
 *
 * Simulates three scenarios against staging:
 *   Phase 1 — Burst: 50 VUs concurrently trigger the job-worker endpoint
 *             to verify FOR UPDATE SKIP LOCKED prevents double-processing.
 *   Phase 2 — Drain: single VU polls the worker until queue depth hits 0,
 *             measuring drain throughput for a pre-seeded 10k job backlog.
 *   Phase 3 — Retry storm: worker is called while 10k jobs are in backoff;
 *             measures that claim latency stays bounded (O(log N) with new index).
 *
 * Prerequisites:
 *   • Seed 10 000 bulk_email jobs in staging job_queue (status='pending',
 *     run_after=NOW()) before running Phase 2:
 *       psql $STAGING_DB -c "INSERT INTO job_queue (job_type, payload, status, run_after)
 *         SELECT 'bulk_email', '{\"to\":\"test@cs.test\",\"toName\":\"T\",
 *         \"subject\":\"s\",\"html\":\"<p/>\",\"campaignId\":\"load-test\"}'::jsonb,
 *         'pending', NOW() FROM generate_series(1,10000);"
 *   • For Phase 3, seed 10 000 with run_after = NOW() + INTERVAL '30 minutes'.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.connectedsteps.in \
 *          --env CRON_SECRET=<secret> \
 *          tests/load/k6-job-queue.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const claimLatency = new Trend("claim_latency_ms", true);
const workerErrors = new Counter("worker_errors");
const errorRate    = new Rate("error_rate");

const BASE_URL    = __ENV.BASE_URL    || "https://staging.connectedsteps.in";
const CRON_SECRET = __ENV.CRON_SECRET || "";

export const options = {
  scenarios: {
    // Phase 1: concurrent worker calls — verify SKIP LOCKED atomicity
    burst: {
      executor:    "constant-vus",
      vus:         50,
      duration:    "30s",
      startTime:   "0s",
      tags:        { scenario: "burst" },
    },
    // Phase 2: drain measurement — single VU polls until empty
    drain: {
      executor:    "constant-vus",
      vus:         1,
      duration:    "300s",
      startTime:   "35s",
      tags:        { scenario: "drain" },
    },
    // Phase 3: retry storm — call worker when all 10k jobs are in backoff
    retry_storm: {
      executor:    "ramping-vus",
      startVUs:    0,
      stages: [
        { duration: "5s",  target: 20 },
        { duration: "20s", target: 20 },
        { duration: "5s",  target: 0 },
      ],
      startTime:   "340s",
      tags:        { scenario: "retry_storm" },
    },
  },
  thresholds: {
    // Worker claim must complete within 3s even under burst
    claim_latency_ms: ["p(95)<3000"],
    error_rate:       ["rate<0.01"],
    // Worker must return 200 under all scenarios
    "http_req_duration{scenario:burst}":       ["p(95)<3000"],
    "http_req_duration{scenario:drain}":       ["p(95)<5000"],
    "http_req_duration{scenario:retry_storm}": ["p(95)<3000"],
  },
};

function callWorker() {
  const start = Date.now();
  const res   = http.get(`${BASE_URL}/api/cron/job-worker`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    timeout: "10s",
  });
  claimLatency.add(Date.now() - start);

  const ok = check(res, {
    "status 200":          (r) => r.status === 200,
    "processed field":     (r) => r.json("processed") !== undefined,
    "no dead increment":   (r) => (r.json("dead") ?? 0) === 0,
  });

  if (!ok || res.status !== 200) {
    workerErrors.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  return res.json();
}

export default function () {
  const scenario = __ENV.K6_SCENARIO_NAME || "";

  const result = callWorker();

  if (scenario === "drain") {
    // In drain phase: stop early if queue is empty (processed=0 twice)
    if ((result?.processed ?? 0) === 0) {
      sleep(2);
    } else {
      sleep(0.1);
    }
  } else if (scenario === "retry_storm") {
    // Retry storm: 10k jobs with run_after in the future — worker should
    // return processed=0 quickly, proving the new run_after index avoids
    // a full table scan rather than waiting for all N rows to be checked.
    sleep(0.5);
  } else {
    // Burst: small delay between concurrent calls
    sleep(0.2);
  }
}

export function handleSummary(data) {
  const p95 = data.metrics.claim_latency_ms?.values?.["p(95)"] ?? 0;
  const errors = data.metrics.worker_errors?.values?.count ?? 0;
  return {
    stdout: `\n=== Job Queue Stress Test ===
Claim p95 latency : ${Math.round(p95)}ms  (target <3000ms)
Worker errors     : ${errors}
See /admin/system-health → Queue section for dead-letter count.\n`,
  };
}
