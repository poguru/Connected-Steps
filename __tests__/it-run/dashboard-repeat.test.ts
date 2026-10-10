/**
 * The participant dashboard, repeated: the same authenticated lookup returns the same result each time,
 * transient database failures are reported as server errors and recover on the next request, every
 * response carries a request id, and no request writes anything.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn(), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/it-run-auth", () => ({
  ...jest.requireActual("@/lib/it-run-auth"),
  itRunActionKey: () => Buffer.alloc(32, 9),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { GET } from "@/app/api/it-run/dashboard/[code]/route";
import { isDashboardPayload, classifyDashboardFailure } from "@/lib/it-run-dashboard";

const mockDb = getSupabaseServer as jest.Mock;
const mockUser = verifyUserToken as jest.Mock;

const OWNER = "asha@example.com";
const CODE = "ITR-0001";

const REG = {
  id: "reg-1", registration_code: CODE, lead_email: OWNER, linked_user_email: OWNER,
  participant_count: 1, base_price: 799, discount_amount: 0, final_price: 799, early_bird_offer_id: null,
  payment_status: "paid", registration_status: "active", cancelled_reason: null, cancelled_at: null, coupon_id: null,
  created_at: "2026-10-01T00:00:00Z", qr_token: "qr-1",
  it_run_categories: { id: "cat-1", slug: "5k", name: "5K Timed Run", distance_km: 5, category_type: "solo", color: "#e8620a", includes_timing: false, includes_medal: false },
  it_run_events: { id: "ev-1", title: "The IT Run Sprint-2", event_date: "2027-02-07", report_time: null, flag_off_time: null, venue_name: null, venue_address: null, city: null },
};

const PARTICIPANT = {
  id: "p-1", participant_type: "solo", qr_token: "qr-1", first_name: "Asha", last_name: "Rao", gender: "female",
  email: OWNER, mobile: "9876543210", blood_group: null, company_name: null, tshirt_size: "M",
  bib_number: null, wave: null, collection_counter: null, verification_status: "pending",
  it_run_bib_bookings: null, it_run_bib_collections: null, it_run_checkins: null,
};

type Behaviour = { regError?: boolean; participantsError?: boolean; slow?: number };

/** Fake whose reads can be scripted to fail or be slow. `writes` records any insert/update/delete/rpc. */
function fakeDb(b: Behaviour = {}) {
  const writes: string[] = [];
  const reads: string[] = [];
  const handle = (table: string) => {
    const bld: any = {};
    for (const m of ["select", "eq", "order", "in"]) bld[m] = () => bld;
    for (const m of ["insert", "update", "upsert", "delete"]) bld[m] = () => { writes.push(`${table}.${m}`); return bld; };
    const run = async (single: boolean) => {
      reads.push(table);
      if (b.slow) await new Promise(r => setTimeout(r, b.slow));
      if (table === "it_run_registrations") {
        if (b.regError) return { data: null, error: { code: "08006", message: "connection failure" } };
        return { data: single ? REG : [REG], error: null };
      }
      if (table === "it_run_participants") {
        if (b.participantsError) return { data: null, error: { code: "57014", message: "timeout" } };
        return { data: [PARTICIPANT], error: null };
      }
      return { data: [], error: null };
    };
    bld.maybeSingle = () => run(true);
    bld.single = () => run(true);
    bld.then = (res: any, rej?: any) => run(false).then(res, rej);
    return bld;
  };
  return { writes, reads, from: handle, rpc: () => { writes.push("rpc"); return Promise.resolve({ data: null, error: null }); } };
}

function call(opts: { cookie?: boolean } = { cookie: true }) {
  return GET(
    new NextRequest(`http://t/api/it-run/dashboard/${CODE}`, {
      headers: opts.cookie ? { cookie: "cs_user_session=tok" } : {},
    }),
    { params: Promise.resolve({ code: CODE }) },
  );
}

let logs: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.mockReturnValue(OWNER);
  logs = [];
  jest.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
  jest.spyOn(console, "error").mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("repeated dashboard opens", () => {
  it("returns the same registration on every repeated open, and writes nothing", async () => {
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    const bodies: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await call();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(isDashboardPayload(body)).toBe(true);
      bodies.push(JSON.stringify({ reg: body.reg.id, qr: body.participants[0].qr_token }));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(db.writes).toEqual([]);
  });

  it("overlapping opens of the same registration each get a complete response", async () => {
    mockDb.mockReturnValue(fakeDb({ slow: 20 }));
    const results = await Promise.all([call(), call(), call()]);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(isDashboardPayload(await res.json())).toBe(true);
    }
  });

  it("a transient database failure is a server error, and the next open recovers", async () => {
    mockDb.mockReturnValue(fakeDb({ regError: true }));
    const failed = await call();
    expect(failed.status).toBe(500);
    expect((await failed.json()).code).toBe("SERVER_ERROR");

    mockDb.mockReturnValue(fakeDb());
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(isDashboardPayload(await ok.json())).toBe(true);
  });

  it("a failed participant query is reported as a server error, not an empty dashboard", async () => {
    mockDb.mockReturnValue(fakeDb({ participantsError: true }));
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.participants).toBeUndefined();
  });
});

describe("failure types", () => {
  it("no session: 401 AUTH_REQUIRED", async () => {
    mockUser.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb());
    const res = await call({ cookie: false });
    expect(res.status).toBe(401);
    expect(classifyDashboardFailure(res.status, await res.json())).toBe("AUTH_REQUIRED");
  });

  it("signed in to another account: 403 FORBIDDEN", async () => {
    mockUser.mockReturnValue("someone-else@example.com");
    mockDb.mockReturnValue(fakeDb());
    const res = await call();
    expect(res.status).toBe(403);
    expect(classifyDashboardFailure(res.status, await res.json())).toBe("FORBIDDEN");
  });

  it("unknown code: 404 NOT_FOUND", async () => {
    mockDb.mockReturnValue({ ...fakeDb(), from: () => { const bld: any = {}; for (const m of ["select", "eq", "order", "in"]) bld[m] = () => bld; bld.maybeSingle = () => Promise.resolve({ data: null, error: null }); return bld; } });
    const res = await call();
    expect(res.status).toBe(404);
    expect(classifyDashboardFailure(res.status, await res.json())).toBe("NOT_FOUND");
  });

  it("a server failure is 500 SERVER_ERROR", async () => {
    mockDb.mockReturnValue(fakeDb({ regError: true }));
    const res = await call();
    expect(classifyDashboardFailure(res.status, await res.json())).toBe("SERVER_ERROR");
  });
});

describe("diagnostics", () => {
  it("every response carries a request id, and the same id appears in the log line", async () => {
    mockDb.mockReturnValue(fakeDb());
    const res = await call();
    const rid = res.headers.get("x-request-id");
    expect(rid).toMatch(/^[0-9a-f-]{36}$/);
    expect(logs.some(l => l.includes(`"rid":"${rid}"`) && l.includes('"status":200'))).toBe(true);
  });

  it("a failing stage is logged with its stage and database code, under the same request id", async () => {
    mockDb.mockReturnValue(fakeDb({ regError: true }));
    const res = await call();
    const rid = res.headers.get("x-request-id");
    const stage = logs.find(l => l.includes('"stage":"registration_query"'));
    expect(stage).toBeDefined();
    expect(stage).toContain(`"rid":"${rid}"`);
    expect(stage).toContain('"dbCode":"08006"');
  });

  it("logs never contain the session token, the email, or the participant's name", async () => {
    mockDb.mockReturnValue(fakeDb({ regError: true }));
    await call();
    mockDb.mockReturnValue(fakeDb());
    await call();
    const all = logs.join("\n");
    expect(all).not.toContain("tok");
    expect(all).not.toContain(OWNER);
    expect(all).not.toContain("Asha");
  });
});
