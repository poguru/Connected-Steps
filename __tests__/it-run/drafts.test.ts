/**
 * Registration drafts (save and resume).
 *  - Validation: only draft fields are accepted; registration and payment fields are dropped.
 *  - Save: creates, saves over a matching version, refuses stale versions, and never overwrites a
 *    converted, expired, or unknown draft.
 *  - Resume: returns the saved state and version.
 *  - Safety: a save touches only the draft table (never registrations, capacity, coupons, or payments).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn().mockReturnValue(null), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.2",
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  validateDraftState,
  newDraftToken,
  hashDraftToken,
  isWellFormedDraftToken,
  DRAFT_TTL_MS,
  MAX_DRAFT_PARTICIPANTS,
} from "@/lib/it-run-drafts";
import { POST as savePost, GET as resumeGet } from "@/app/api/it-run/drafts/route";
import { POST as discardPost } from "@/app/api/it-run/drafts/discard/route";

const mockDb = getSupabaseServer as jest.Mock;

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";

const VALID_DRAFT = {
  step: 2,
  participantSubIdx: 0,
  selectedCatId: CATEGORY_ID,
  couponCode: "",
  participants: [{ firstName: "Asha", lastName: "Rao", mobile: "9876543210", dob: "1990-05-10", email: "asha@example.com" }],
};

// ── Validation ─────────────────────────────────────────────────────────────────

describe("validateDraftState", () => {
  it("accepts a partial draft (mandatory fields may be empty)", () => {
    const r = validateDraftState({ ...VALID_DRAFT, participants: [{ firstName: "" }] });
    expect(r.ok).toBe(true);
  });

  it("keeps only draft fields and drops registration or payment state", () => {
    const r = validateDraftState({
      ...VALID_DRAFT,
      regId: "reg-1", regCode: "ITR-1", finalPrice: 100, razorpay_order_id: "order_1", savedAt: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.state).sort()).toEqual(["couponCode", "participantSubIdx", "participants", "selectedCatId", "step"]);
    }
  });

  it("drops nested objects inside participant fields", () => {
    const r = validateDraftState({ ...VALID_DRAFT, participants: [{ firstName: "A", companyIdFile: { size: 1 } }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.participants[0]).toEqual({ firstName: "A" });
  });

  it.each([
    ["step 0", { step: 0 }],
    ["step 7 (success screen is not a draft)", { step: 7 }],
    ["non-integer step", { step: 2.5 }],
    ["missing category", { selectedCatId: "" }],
    ["no participants", { participants: [] }],
    ["too many participants", { participants: Array.from({ length: MAX_DRAFT_PARTICIPANTS + 1 }, () => ({})) }],
    ["oversized field", { participants: [{ bibName: "x".repeat(201) }] }],
    ["oversized coupon", { couponCode: "c".repeat(41) }],
    ["participant index out of range", { participantSubIdx: MAX_DRAFT_PARTICIPANTS }],
  ])("rejects %s", (_label, change) => {
    expect(validateDraftState({ ...VALID_DRAFT, ...change }).ok).toBe(false);
  });

  it("rejects a non-object draft", () => {
    expect(validateDraftState(null).ok).toBe(false);
    expect(validateDraftState([VALID_DRAFT]).ok).toBe(false);
  });
});

// ── Tokens ─────────────────────────────────────────────────────────────────────

describe("draft tokens", () => {
  it("are unique and well-formed", () => {
    const a = newDraftToken();
    const b = newDraftToken();
    expect(a).not.toBe(b);
    expect(isWellFormedDraftToken(a)).toBe(true);
    expect(isWellFormedDraftToken("short")).toBe(false);
    expect(isWellFormedDraftToken("has spaces and symbols !!!!!!!!!!!")).toBe(false);
  });

  it("are stored only as a hash", () => {
    const token = newDraftToken();
    expect(hashDraftToken(token)).not.toContain(token);
    expect(hashDraftToken(token)).toBe(hashDraftToken(token));
  });

  it("the draft lifetime is 14 days", () => {
    expect(DRAFT_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

// ── Database fake ──────────────────────────────────────────────────────────────

type Call = { table: string; op: string; payload?: any; filters: Record<string, unknown> };

/**
 * Minimal Supabase-style builder. handlers[table](call) returns { data, error } for the terminal call.
 */
function fakeDb(handlers: Record<string, (c: Call) => { data: unknown; error: any }>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const c: Call = { table, op: "select", filters: {} };
      const b: any = {
        select() { return b; },
        eq(k: string, v: unknown) { c.filters[k] = v; return b; },
        gt(k: string, v: unknown) { c.filters[`gt:${k}`] = v; return b; },
        order() { return b; },
        limit() { return b; },
        insert(p: unknown) { c.op = "insert"; c.payload = p; return b; },
        update(p: unknown) { c.op = "update"; c.payload = p; return b; },
        maybeSingle() { return run(); },
        then(res: (v: any) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
      };
      function run() {
        calls.push({ ...c, filters: { ...c.filters } });
        const h = handlers[table];
        return Promise.resolve(h ? h(c) : { data: null, error: null });
      }
      return b;
    },
    rpc() { calls.push({ table: "rpc", op: "rpc", filters: {} }); return Promise.resolve({ data: null, error: null }); },
  };
  return { db, calls };
}

function baseHandlers(draftRow: any = null) {
  return {
    it_run_events: () => ({ data: { id: EVENT_ID }, error: null }),
    it_run_categories: () => ({ data: { id: CATEGORY_ID }, error: null }),
    it_run_drafts: (c: Call) => {
      if (c.op === "insert") return { data: { version: 1 }, error: null };
      if (c.op === "update") return { data: { version: (draftRow?.version ?? 0) + 1 }, error: null };
      return { data: draftRow, error: null };
    },
  };
}

function saveReq(body: unknown) {
  return new NextRequest("http://t/api/it-run/drafts", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

const future = () => new Date(Date.now() + DRAFT_TTL_MS).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

// ── Save ───────────────────────────────────────────────────────────────────────

describe("POST /api/it-run/drafts (save)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a draft, returns a token, and stores only its hash", async () => {
    const { db, calls } = fakeDb(baseHandlers());
    mockDb.mockReturnValue(db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(isWellFormedDraftToken(body.token)).toBe(true);
    expect(body.version).toBe(1);
    const insert = calls.find(c => c.table === "it_run_drafts" && c.op === "insert");
    expect(insert?.payload.token_hash).toBe(hashDraftToken(body.token));
    expect(JSON.stringify(insert?.payload)).not.toContain(body.token);
  });

  it("saves over the draft only when the expected version matches, and bumps the version", async () => {
    const token = newDraftToken();
    const row = { id: "d1", status: "open", version: 3, state: {}, saved_at: "2026-10-09T00:00:00Z", expires_at: future(), owner_email: null };
    const { db, calls } = fakeDb(baseHandlers(row));
    mockDb.mockReturnValue(db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT, token, expectedVersion: 3 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.version).toBe(4);
    const upd = calls.find(c => c.table === "it_run_drafts" && c.op === "update");
    expect(upd?.filters).toMatchObject({ id: "d1", version: 3, status: "open" });
  });

  it("refuses a stale version without writing (another tab or device saved first)", async () => {
    const token = newDraftToken();
    const row = { id: "d1", status: "open", version: 5, state: {}, saved_at: "2026-10-09T00:00:00Z", expires_at: future(), owner_email: null };
    const { db, calls } = fakeDb(baseHandlers(row));
    mockDb.mockReturnValue(db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT, token, expectedVersion: 3 }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("VERSION_CONFLICT");
    expect(body.currentVersion).toBe(5);
    expect(calls.some(c => c.op === "update")).toBe(false);
  });

  it("refuses to change a converted draft", async () => {
    const token = newDraftToken();
    const row = { id: "d1", status: "converted", version: 2, state: {}, saved_at: "x", expires_at: future(), owner_email: null };
    mockDb.mockReturnValue(fakeDb(baseHandlers(row)).db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT, token, expectedVersion: 2 }));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DRAFT_CONVERTED");
  });

  it("refuses an expired draft with 410", async () => {
    const token = newDraftToken();
    const row = { id: "d1", status: "open", version: 2, state: {}, saved_at: "x", expires_at: past(), owner_email: null };
    mockDb.mockReturnValue(fakeDb(baseHandlers(row)).db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT, token, expectedVersion: 2 }));

    expect(res.status).toBe(410);
  });

  it("treats an unknown token as not found and never creates a draft for it", async () => {
    const { db, calls } = fakeDb(baseHandlers(null));
    mockDb.mockReturnValue(db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT, token: newDraftToken(), expectedVersion: 1 }));

    expect(res.status).toBe(404);
    expect(calls.some(c => c.op === "insert")).toBe(false);
  });

  it("requires a version when updating", async () => {
    mockDb.mockReturnValue(fakeDb(baseHandlers()).db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT, token: newDraftToken() }));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VERSION_REQUIRED");
  });

  it("rejects an unknown category before writing", async () => {
    const handlers = { ...baseHandlers(), it_run_categories: () => ({ data: null, error: null }) };
    const { db, calls } = fakeDb(handlers);
    mockDb.mockReturnValue(db);

    const res = await savePost(saveReq({ draft: VALID_DRAFT }));

    expect(res.status).toBe(400);
    expect(calls.some(c => c.op === "insert")).toBe(false);
  });

  it("only ever writes to the draft table: never registrations, capacity, coupons, or payments", async () => {
    const { db, calls } = fakeDb(baseHandlers());
    mockDb.mockReturnValue(db);

    await savePost(saveReq({ draft: { ...VALID_DRAFT, regId: "x", finalPrice: 1 } }));

    const writes = calls.filter(c => c.op !== "select");
    expect(writes.map(w => w.table)).toEqual(["it_run_drafts"]);
    expect(calls.some(c => c.table === "rpc")).toBe(false);
  });
});

// ── Resume ─────────────────────────────────────────────────────────────────────

function resumeReq(token: string) {
  return new NextRequest(`http://t/api/it-run/drafts?t=${encodeURIComponent(token)}`);
}

describe("GET /api/it-run/drafts (resume)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the saved state and version for a valid token", async () => {
    const token = newDraftToken();
    const row = { id: "d1", status: "open", version: 4, state: VALID_DRAFT, saved_at: "2026-10-09T00:00:00Z", expires_at: future(), owner_email: null };
    mockDb.mockReturnValue(fakeDb(baseHandlers(row)).db);

    const res = await resumeGet(resumeReq(token));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.version).toBe(4);
    expect(body.draft).toEqual(VALID_DRAFT);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 404 for an unknown or malformed token", async () => {
    mockDb.mockReturnValue(fakeDb(baseHandlers(null)).db);
    expect((await resumeGet(resumeReq(newDraftToken()))).status).toBe(404);
    expect((await resumeGet(resumeReq("bad"))).status).toBe(400);
  });

  it("returns 410 for an expired draft and 409 for a converted one", async () => {
    const token = newDraftToken();
    mockDb.mockReturnValue(fakeDb(baseHandlers({ id: "d", status: "open", version: 1, state: VALID_DRAFT, saved_at: "x", expires_at: past(), owner_email: null })).db);
    expect((await resumeGet(resumeReq(token))).status).toBe(410);

    mockDb.mockReturnValue(fakeDb(baseHandlers({ id: "d", status: "converted", version: 1, state: VALID_DRAFT, saved_at: "x", expires_at: future(), owner_email: null })).db);
    expect((await resumeGet(resumeReq(token))).status).toBe(409);
  });
});

// ── Discard ────────────────────────────────────────────────────────────────────

describe("POST /api/it-run/drafts/discard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks the draft discarded and never touches a registration", async () => {
    const { db, calls } = fakeDb(baseHandlers());
    mockDb.mockReturnValue(db);

    const res = await discardPost(new NextRequest("http://t/api/it-run/drafts/discard", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: newDraftToken() }),
    }));

    expect(res.status).toBe(200);
    const writes = calls.filter(c => c.op === "update");
    expect(writes.map(w => w.table)).toEqual(["it_run_drafts"]);
    expect(writes[0].payload).toEqual({ status: "discarded" });
  });
});
