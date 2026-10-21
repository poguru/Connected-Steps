/**
 * Registration stage tracking: the route records only valid stages with a valid journey key, always answers 204, and the
 * registration page reports each step. Nothing here changes the registration.
 */

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

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

describe("the monitoring route", () => {
  it("records a valid stage for a valid journey key, and answers 204", async () => {
    const res = await call({ journeyKey: KEY, stage: "category_selected" });
    expect(res.status).toBe(204);
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ journeyKey: KEY, stage: "category_selected", eventId: "e1" }));
  });

  it("ignores an unknown stage, a bad key, or a missing body, and still answers 204", async () => {
    expect((await call({ journeyKey: KEY, stage: "made_up" })).status).toBe(204);
    expect((await call({ journeyKey: "x", stage: "landing" })).status).toBe(204);
    expect((await call({})).status).toBe(204);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe("the registration page reports each step", () => {
  const page = read("app/it-run/register/page.tsx");

  it("reports the stage when the step changes, using the funnel names", () => {
    expect(page).toMatch(/reportStage\(stage\)/);
    expect(page).toMatch(/1: "landing", 2: "category_selected", 3: "details_submitted", 4: "validation_passed", 6: "payment_initiated", 7: "confirmed"/);
  });

  it("the browser helper keeps no personal data and never throws", () => {
    const client = read("lib/it-run-monitoring-client.ts");
    expect(client).toMatch(/crypto\.getRandomValues/);
    expect(client).toMatch(/catch \{/);
    expect(client).not.toMatch(/email|mobile|name/i);
  });
});
