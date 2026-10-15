/**
 * The admin email API: only event admins, only this event's runners, previews send nothing, and bad input is refused
 * before anything is queued.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.50",
}));
jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn().mockResolvedValue({ ok: true, messageId: "m" }) }));
jest.mock("@/lib/it-run-email", () => ({ buildCategoryConfirmation: jest.fn() }));

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/it-run-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";
import { POST } from "@/app/api/it-run/admin/emails/route";

const EVENT = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT = "22222222-2222-4222-8222-222222222222";
const BATCH = "9b1c1f0e-6d2a-4f3b-9a51-2f0c7d8e1a11";
const OUR_RUNNER = "33333333-3333-4333-8333-333333333333";
const OTHER_RUNNER = "44444444-4444-4444-8444-444444444444";

function fakeDb(event = EVENT) {
  const inserts: string[] = [];
  return {
    inserts,
    from(table: string) {
      const b: any = {};
      b.select = () => b; b.eq = () => b; b.not = () => b; b.order = () => b; b.limit = () => b; b.returns = () => b;
      b.insert = () => { inserts.push(table); return b; };
      b.update = () => { inserts.push(table); return b; };
      b.maybeSingle = () => Promise.resolve({ data: table === "it_run_events" ? { id: event } : null, error: null });
      b.then = (res: any, rej?: any) => {
        let data: any = [];
        if (table === "it_run_participants") {
          data = [
            { id: OUR_RUNNER, registration_id: "r1", first_name: "Asha", last_name: "Rao", email: "asha@example.com", category_id: null,
              it_run_registrations: { event_id: EVENT, category_id: "c1", payment_status: "paid", registration_status: "active", created_at: "2026-10-10T00:00:00Z" } },
            { id: OTHER_RUNNER, registration_id: "r2", first_name: "Bala", last_name: "Iyer", email: "bala@example.com", category_id: null,
              it_run_registrations: { event_id: OTHER_EVENT, category_id: "c2", payment_status: "paid", registration_status: "active", created_at: "2026-10-10T00:00:00Z" } },
          ];
        }
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
  };
}

function req(body: unknown) {
  return new NextRequest("http://t/api/it-run/admin/emails", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

const GOOD_UPDATE = { subject: "Venue update", body: "<p>The <b>gate</b> is on the left.</p>" };

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("permissions", () => {
  it("refuses a caller without the event admin role, and touches nothing", async () => {
    (requireRole as jest.Mock).mockReturnValue(null);
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ action: "queue_update", batchId: BATCH, ...GOOD_UPDATE, filter: {} }));
    expect(res.status).toBe(401);
    expect(db.inserts).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("preview", () => {
  it("counts the eligible recipients and sends nothing", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ action: "preview_update", ...GOOD_UPDATE, filter: {} }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.recipientCount).toBe(1); // this event's runner only
    expect(json.previewHtml).toContain("<b>gate</b>");
    expect(db.inserts).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("removes script from the body before the preview is built", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
    const res = await POST(req({ action: "preview_update", subject: "Hi there", body: "<p>Hello</p><script>alert(1)</script>", filter: {} }));
    const json = await res.json();
    expect(json.previewHtml).not.toMatch(/<script/i);
  });
});

describe("queueing", () => {
  it("refuses a batch without a valid id, before anything is queued", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ action: "queue_update", batchId: "not-a-uuid", ...GOOD_UPDATE, filter: {} }));
    expect(res.status).toBe(400);
    expect(db.inserts).toEqual([]);
  });

  it("refuses a runner from another event for a confirmation resend", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ action: "queue_confirmation", batchId: BATCH, participantIds: [OTHER_RUNNER] }));
    expect(res.status).toBe(403);
    expect(db.inserts).toEqual([]);
  });

  it("refuses a category filter that is not an id", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
    const res = await POST(req({ action: "queue_update", batchId: BATCH, ...GOOD_UPDATE, filter: { categoryIds: ["x'; drop"] } }));
    expect(res.status).toBe(400);
  });

  it("refuses an empty message", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
    const res = await POST(req({ action: "queue_update", batchId: BATCH, subject: "Hi", body: "<script></script>", filter: {} }));
    expect(res.status).toBe(400);
  });
});

describe("sending", () => {
  it("refuses to process a batch that belongs to another event", async () => {
    const db = {
      from(table: string) {
        const b: any = {};
        b.select = () => b; b.eq = () => b; b.limit = () => b;
        b.then = (res: any, rej?: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
        if (table === "it_run_events") b.maybeSingle = () => Promise.resolve({ data: { id: EVENT }, error: null });
        return b;
      },
    };
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ action: "process", batchId: BATCH }));
    expect(res.status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
