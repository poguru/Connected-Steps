/**
 * Failure monitoring: failed OTP, registration and payment requests are counted by step and status code. The
 * registration page reports each failure, the event route accepts only known steps, and the admin summary shows the
 * counts with an alert. No message, body or personal detail is stored.
 */

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import {
  summarizeErrors,
  isMonitoredEndpoint,
  isReportableStatus,
  ERROR_ALERT_THRESHOLD,
} from "@/lib/it-run-monitoring";

const mockRecord = jest.fn(async () => true);
jest.mock("@/lib/it-run-monitoring", () => {
  const actual = jest.requireActual("@/lib/it-run-monitoring");
  return { ...actual, recordJourneyEvent: (...args: unknown[]) => mockRecord(...(args as [])) };
});
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "e1" }, error: null }) }) }) }),
  }),
}));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: async () => ({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.5",
}));

import { POST } from "@/app/api/it-run/monitoring/event/route";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const KEY = "aB3_-xY9kLmN0pQrStUv";
const call = (body: unknown) => POST(new NextRequest("http://t/api/it-run/monitoring/event", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

beforeEach(() => mockRecord.mockClear());

describe("the failure summary", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();

  it("groups failures by step and status, most frequent first", () => {
    const s = summarizeErrors([
      { endpoint: "/api/auth/send-otp", httpStatus: 429, createdAt: ago(1) },
      { endpoint: "/api/auth/send-otp", httpStatus: 429, createdAt: ago(2) },
      { endpoint: "/api/it-run/payment/verify", httpStatus: null, createdAt: ago(3) },
    ], now);
    expect(s.total).toBe(3);
    expect(s.byEndpoint[0]).toEqual({ endpoint: "/api/auth/send-otp", httpStatus: 429, count: 2 });
    expect(s.byEndpoint[1]).toEqual({ endpoint: "/api/it-run/payment/verify", httpStatus: 0, count: 1 });
  });

  it("raises the alert only when the last hour reaches the threshold", () => {
    const burst = (n: number, min: number) => Array.from({ length: n }, () => ({ endpoint: "/api/auth/send-otp", httpStatus: 500, createdAt: ago(min) }));
    expect(summarizeErrors(burst(ERROR_ALERT_THRESHOLD - 1, 5), now).alert).toBe(false);
    expect(summarizeErrors(burst(ERROR_ALERT_THRESHOLD, 5), now).alert).toBe(true);
    // Old failures do not count toward the last hour
    expect(summarizeErrors(burst(ERROR_ALERT_THRESHOLD, 61), now).alert).toBe(false);
  });
});

describe("what is accepted", () => {
  it("accepts only the monitored steps", () => {
    expect(isMonitoredEndpoint("/api/auth/send-otp")).toBe(true);
    expect(isMonitoredEndpoint("/api/admin/users")).toBe(false);
    expect(isMonitoredEndpoint(undefined)).toBe(false);
  });

  it("accepts only whole HTTP statuses from 0 to 599", () => {
    expect(isReportableStatus(0)).toBe(true);
    expect(isReportableStatus(429)).toBe(true);
    expect(isReportableStatus(600)).toBe(false);
    expect(isReportableStatus(-1)).toBe(false);
    expect(isReportableStatus(4.5)).toBe(false);
    expect(isReportableStatus("500")).toBe(false);
  });
});

describe("the monitoring route records failures", () => {
  it("records a failure for a known step with its status code", async () => {
    const res = await call({ journeyKey: KEY, kind: "error", endpoint: "/api/auth/send-otp", httpStatus: 429 });
    expect(res.status).toBe(204);
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({
      journeyKey: KEY, eventType: "error", endpoint: "/api/auth/send-otp", httpStatus: 429, eventId: "e1",
    }));
  });

  it("ignores an unknown step or a bad status, and still answers 204", async () => {
    expect((await call({ journeyKey: KEY, kind: "error", endpoint: "/api/admin/users", httpStatus: 500 })).status).toBe(204);
    expect((await call({ journeyKey: KEY, kind: "error", endpoint: "/api/auth/send-otp", httpStatus: "boom" })).status).toBe(204);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("stores only the step and status, never a message or body field", () => {
    const route = read("app/api/it-run/monitoring/event/route.ts");
    expect(route).not.toMatch(/\.error\b|body\.message|body\.(email|mobile|name)/);
  });
});

describe("the registration page reports failed requests", () => {
  const page = read("app/it-run/register/page.tsx");

  it.each([
    "/api/auth/send-otp",
    "/api/auth/complete-event-verify",
    "/api/it-run/register",
    "/api/it-run/payment/create-order",
    "/api/it-run/payment/verify",
  ])("reports %s when it answers with an error and when there is no response", endpoint => {
    expect(page).toContain(`reportFailure("${endpoint}", res.status)`);
    expect(page).toContain(`reportFailure("${endpoint}", 0)`);
  });

  it("the browser helper sends only the step and status, never the response body", () => {
    const client = read("lib/it-run-monitoring-client.ts");
    expect(client).toMatch(/send\(\{ kind: "error", endpoint, httpStatus \}\)/);
    expect(client).not.toMatch(/\.json\(\)|\.text\(\)/);
  });
});

describe("the admin summary and dashboard", () => {
  it("the route returns failure counts for the same period", () => {
    const route = read("app/api/it-run/admin/monitoring/route.ts");
    expect(route).toMatch(/summarizeErrors/);
    expect(route).toMatch(/eq\("event_type", "error"\)/);
    expect(route).toMatch(/registration_journeys!inner\(event_id\)/);
  });

  it("the dashboard shows the failures panel and the alert", () => {
    const page = read("app/it-run/admin/monitoring/page.tsx");
    expect(page).toMatch(/Failed requests/);
    expect(page).toMatch(/data\.errors\.alert/);
  });
});
