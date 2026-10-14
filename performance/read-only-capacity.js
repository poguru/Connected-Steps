// k6 read-only capacity test for The IT Run Sprint-2 public pages and APIs.
// Writes nothing: only GET requests for the event, categories and the registration page.
//
// Run (local or staging):
//   k6 run -e TARGET_URL=https://staging.example.com performance/read-only-capacity.js
//
// Against production this script refuses to start unless you pass ALLOW_PRODUCTION_READ_ONLY=yes and
// confirm the traffic level is small (see performance/README.md).

import http from "k6/http";
import { check, sleep } from "k6";

const TARGET = __ENV.TARGET_URL;
if (!TARGET) {
  throw new Error("TARGET_URL is required, e.g. -e TARGET_URL=https://staging.example.com");
}
const IS_PRODUCTION = /(^|\/\/)(www\.)?connectedsteps\.in(\/|$)/.test(TARGET);
if (IS_PRODUCTION && __ENV.ALLOW_PRODUCTION_READ_ONLY !== "yes") {
  throw new Error("Refusing to run against production. Set ALLOW_PRODUCTION_READ_ONLY=yes only after approval.");
}

// Stage levels follow the agreed plan. Production is capped at 10 users, read-only.
const LEVEL = __ENV.LEVEL || "baseline";
const STAGES = {
  smoke:    [{ duration: "30s", target: 5 }],
  baseline: [{ duration: "30s", target: 10 }, { duration: "1m", target: 10 }, { duration: "15s", target: 0 }],
  moderate: [{ duration: "1m", target: 50 }, { duration: "2m", target: 50 }, { duration: "15s", target: 0 }],
  target:   [{ duration: "1m", target: 100 }, { duration: "3m", target: 100 }, { duration: "15s", target: 0 }],
  capacity: [{ duration: "2m", target: 200 }, { duration: "3m", target: 200 }, { duration: "30s", target: 0 }],
};
if (!STAGES[LEVEL]) throw new Error(`Unknown LEVEL ${LEVEL}`);
if (IS_PRODUCTION && (LEVEL === "target" || LEVEL === "capacity" || LEVEL === "moderate")) {
  throw new Error("Production is limited to smoke and baseline. Higher levels need staging.");
}

export const options = {
  stages: STAGES[LEVEL],
  thresholds: {
    // Read-only pages and APIs: p95 under 1 second; errors under 1%
    "http_req_duration{kind:read}": ["p(95)<1000", "p(99)<2500"],
    http_req_failed: ["rate<0.01"],
  },
};

const PAGES = [
  { name: "event-page",   url: `${TARGET}/it-run`,                       kind: "page" },
  { name: "event-config", url: `${TARGET}/api/it-run/event-config`,     kind: "api" },
  { name: "categories",   url: `${TARGET}/api/it-run/categories`,       kind: "api" },
  { name: "register-page", url: `${TARGET}/it-run/register`,            kind: "page" },
];

export default function () {
  for (const p of PAGES) {
    const res = http.get(p.url, {
      tags: { kind: "read", endpoint: p.name },
      timeout: "10s",
    });
    check(res, {
      [`${p.name} is 200`]: r => r.status === 200,
    });
    // Realistic pause between page views
    sleep(1 + Math.random() * 3);
  }
}
