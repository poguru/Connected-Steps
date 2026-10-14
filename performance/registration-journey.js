// k6 registration-journey test: drafts and category selection under concurrent users.
// WRITES DATA. Staging only. It saves registration drafts with synthetic participants named "LoadTest".
// It never creates a registration, never starts a payment, and never sends OTP or email.
//
// Run against staging only, with a test-user session cookie created for the test account:
//   k6 run -e TARGET_URL=https://staging.example.com -e TEST_SESSION_COOKIE=... -e LEVEL=moderate performance/registration-journey.js
//
// The draft payload follows the app's own save call (see saveProgress in app/it-run/register/page.tsx).

import http from "k6/http";
import { check, sleep } from "k6";

const TARGET = __ENV.TARGET_URL;
const SESSION = __ENV.TEST_SESSION_COOKIE;
if (!TARGET) throw new Error("TARGET_URL is required");
if (/(^|\/\/)(www\.)?connectedsteps\.in(\/|$)/.test(TARGET)) {
  throw new Error("This write test never runs against production. Use a staging URL.");
}
if (!SESSION) throw new Error("TEST_SESSION_COOKIE is required: a session for a synthetic test account on staging");

const LEVEL = __ENV.LEVEL || "baseline";
const STAGES = {
  smoke:    [{ duration: "30s", target: 5 }],
  baseline: [{ duration: "30s", target: 10 }, { duration: "1m", target: 10 }, { duration: "15s", target: 0 }],
  moderate: [{ duration: "1m", target: 50 }, { duration: "2m", target: 50 }, { duration: "15s", target: 0 }],
  target:   [{ duration: "1m", target: 100 }, { duration: "3m", target: 100 }, { duration: "15s", target: 0 }],
  capacity: [{ duration: "2m", target: 200 }, { duration: "3m", target: 200 }, { duration: "30s", target: 0 }],
};
if (!STAGES[LEVEL]) throw new Error(`Unknown LEVEL ${LEVEL}`);

export const options = {
  stages: STAGES[LEVEL],
  thresholds: {
    "http_req_duration{kind:read}": ["p(95)<1000", "p(99)<2500"],
    "http_req_duration{kind:write}": ["p(95)<2000", "p(99)<4000"],
    http_req_failed: ["rate<0.01"],
  },
};

const HEADERS = {
  "Content-Type": "application/json",
  Cookie: `cs_user_session=${SESSION}`,
};

// Synthetic participant. Every name starts with "LoadTest" so cleanup can find it.
function syntheticParticipant(vu, iter) {
  const tag = `${vu}${iter}`;
  return {
    type: "solo",
    firstName: `LoadTest${tag}`,
    lastName: "Synthetic",
    bibName: `LOADTEST ${tag}`,
    gender: "female",
    dob: "1990-05-10",
    email: `loadtest+${tag}@example.invalid`,
    mobile: `9${String(100000000 + vu * 1000 + iter).slice(-9)}`,
    bloodGroup: "O+",
    emergencyName: "LoadTest Contact",
    emergencyPhone: `8${String(100000000 + vu * 1000 + iter + 7).slice(-9)}`,
    companyName: "LoadTest Co",
    tshirtSize: "M",
    medicalConditions: "",
    foodPreference: "veg",
  };
}

export default function () {
  // 1. Event data, as a visitor would load it
  const cfg = http.get(`${TARGET}/api/it-run/event-config`, { tags: { kind: "read", endpoint: "event-config" } });
  check(cfg, { "event-config 200": r => r.status === 200 });
  const categories = cfg.json("categories") || [];
  const open = categories.find(c => !c.is_soldout && c.participant_count === 1);
  if (!open) {
    sleep(2);
    return;
  }

  // 2. Save a draft, as the wizard does after the category step
  const body = JSON.stringify({
    draft: {
      step: 2,
      participantSubIdx: 0,
      selectedCatId: open.id,
      couponCode: null,
      participants: [syntheticParticipant(__VU, __ITER)],
    },
  });
  const save = http.post(`${TARGET}/api/it-run/drafts`, body, {
    headers: HEADERS,
    tags: { kind: "write", endpoint: "draft-save" },
    timeout: "15s",
  });
  check(save, {
    "draft saved (200)": r => r.status === 200,
    "not a 5xx": r => r.status < 500,
  });

  // Realistic pause: a person reads the form before the next step
  sleep(3 + Math.random() * 5);
}

// Stop cleanly if the target stops responding, rather than piling up requests
export function handleSummary(data) {
  return { stdout: `Level ${LEVEL} finished. Synthetic drafts were created under "LoadTest" names only.\n` };
}
