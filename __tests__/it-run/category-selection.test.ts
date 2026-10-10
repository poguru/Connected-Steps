/**
 * Category identity through registration: the category the participant selects is the one that opens,
 * is saved, and is paid for. Real slugs from the Sprint-2 migrations are used.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({ verifyUserToken: jest.fn().mockReturnValue(null), USER_SESSION_COOKIE: "cs_user_session" }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.6",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decideUrlCategory, startsNewRegistration, type CategoryRef } from "@/lib/it-run-category-selection";
import { fixedParticipantCount, categoryTypeLabel } from "@/lib/it-run-category-rules";
import { POST as registerPost } from "@/app/api/it-run/register/route";
import { POST as draftPost } from "@/app/api/it-run/drafts/route";
import { newDraftToken, hashDraftToken, DRAFT_TTL_MS } from "@/lib/it-run-drafts";

const mockDb = getSupabaseServer as jest.Mock;

const CATS = [
  { id: "id-10k", slug: "10k-timed", name: "10K Timed Run", is_soldout: false },
  { id: "id-5kt", slug: "5k-timed", name: "5K Timed Run", is_soldout: false },
  { id: "id-5kf", slug: "5k-fun-run", name: "5K Fun Run", is_soldout: false },
  { id: "id-5kd", slug: "5k-duo", name: "5K Duo Challenge", is_soldout: false },
  { id: "id-kid", slug: "2k-kid", name: "2K Parent & Child Duo", is_soldout: false },
  { id: "id-sold", slug: "5k-sold", name: "5K Sold Out", is_soldout: true },
] as const satisfies readonly CategoryRef[];

// ── Which category a link opens ────────────────────────────────────────────────

describe("a ?category= link opens the category it names", () => {
  it.each([
    ["10k-timed", "id-10k"],
    ["5k-timed", "id-5kt"],
    ["5k-fun-run", "id-5kf"],
    ["5k-duo", "id-5kd"],
    ["2k-kid", "id-kid"],
  ])("%s opens its own registration", (slug, id) => {
    const d = decideUrlCategory(slug, [...CATS], null);
    expect(d.kind).toBe("select");
    if (d.kind === "select") expect(d.category.id).toBe(id);
  });

  it("10K never resolves to Parent & Child Duo, even with a saved Parent & Child draft", () => {
    const d = decideUrlCategory("10k-timed", [...CATS], "id-kid");
    expect(d.kind).toBe("select");
    if (d.kind === "select") expect(d.category.slug).toBe("10k-timed");
  });

  it("a saved draft for the same category is offered for resume, not overwritten", () => {
    const d = decideUrlCategory("10k-timed", [...CATS], "id-10k");
    expect(d.kind).toBe("keep-draft");
  });

  it("the slug is matched case-insensitively, without guessing another category", () => {
    const d = decideUrlCategory("10K-TIMED", [...CATS], null);
    expect(d.kind).toBe("select");
    if (d.kind === "select") expect(d.category.id).toBe("id-10k");
  });

  it("an unknown slug is a recoverable error and never selects a default category", () => {
    const d = decideUrlCategory("10k-old", [...CATS], null);
    expect(d.kind).toBe("error");
    if (d.kind === "error") expect(d.message).toMatch(/choose your category below/i);
  });

  it("a sold-out category is refused with a message, not replaced", () => {
    const d = decideUrlCategory("5k-sold", [...CATS], null);
    expect(d.kind).toBe("error");
  });

  it("no link shows the category list", () => {
    expect(decideUrlCategory(null, [...CATS], null).kind).toBe("none");
    expect(decideUrlCategory("   ", [...CATS], null).kind).toBe("none");
  });
});

describe("changing category starts a new registration", () => {
  it("a different category starts a new registration", () => {
    expect(startsNewRegistration("id-kid", "id-10k")).toBe(true);
  });

  it("the same category continues the current registration", () => {
    expect(startsNewRegistration("id-10k", "id-10k")).toBe(false);
  });

  it("the first selection starts a registration", () => {
    expect(startsNewRegistration(null, "id-10k")).toBe(true);
  });
});

// ── Participant rules per category ─────────────────────────────────────────────

describe("participant count comes from the category type", () => {
  it("fixed-composition categories need their exact count; individual categories have none", () => {
    expect(fixedParticipantCount("solo")).toBeNull();
    expect(fixedParticipantCount("duo")).toBe(2);
    expect(fixedParticipantCount("kid")).toBe(2);
  });

  it("only the Parent & Child category is labelled as one", () => {
    expect(categoryTypeLabel("kid")).toBe("The Parent & Child Duo");
    expect(categoryTypeLabel("solo")).not.toMatch(/Parent/);
  });
});

// ── Server boundaries ──────────────────────────────────────────────────────────

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function categoryDb(category: Record<string, unknown> | null, draftRow: any = null) {
  const writes: string[] = [];
  return {
    writes,
    db: {
      from(table: string) {
        const b: any = { op: "select" };
        b.select = () => b;
        b.eq = () => b;
        b.gt = () => b;
        b.order = () => b;
        b.limit = () => b;
        b.in = () => b;
        b.insert = () => { b.op = "insert"; writes.push(table); return b; };
        b.update = () => { b.op = "update"; writes.push(table); return b; };
        b.maybeSingle = () => b.single();
        b.single = () => {
          if (b.op !== "select") return Promise.resolve({ data: { version: 2 }, error: null });
          if (table === "it_run_events") return Promise.resolve({ data: { id: EVENT_ID, registration_closes_at: null, event_date: "2026-08-17" }, error: null });
          if (table === "it_run_categories") return Promise.resolve({ data: category, error: null });
          if (table === "it_run_drafts") return Promise.resolve({ data: draftRow, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        b.then = (res: (v: any) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res, rej);
        return b;
      },
      rpc() { writes.push("rpc"); return Promise.resolve({ data: null, error: null }); },
    },
  };
}

const ACTIVE_KID = { id: "id-kid", event_id: EVENT_ID, name: "2K Parent & Child Duo", category_type: "kid", price_rupees: 999, max_participants: null, is_active: true };
const ACTIVE_SOLO = { id: "id-10k", event_id: EVENT_ID, name: "10K Timed Run", category_type: "solo", price_rupees: 799, max_participants: null, is_active: true };

function registerReq(categoryId: string, count: number) {
  const participants = Array.from({ length: count }, (_, i) => ({
    type: i === 0 ? "parent" : "child", firstName: "A", lastName: "B", bibName: `RUNNER ${i}`,
    gender: "F", dob: "2000-01-01", email: "a@example.com", mobile: "9876543210", bloodGroup: "O+",
    emergencyName: "E", emergencyPhone: "9123456789", companyName: "Acme", employeeId: "1",
    companyIdUrl: "", tshirtSize: "M", medicalConditions: "", foodPreference: "veg",
  }));
  return new NextRequest("http://t/api/it-run/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryId, couponId: null, participants }),
  });
}

describe("registration enforces the selected category's participant count", () => {
  beforeEach(() => jest.clearAllMocks());

  it("a 10K (solo) booking with two runners is not refused for its size", async () => {
    // Individual categories accept several runners in one booking. The fake stops at the first write it does not
    // model, so only the participant-count rule is asserted here.
    const { db } = categoryDb(ACTIVE_SOLO);
    mockDb.mockReturnValue(db);
    const res = await registerPost(registerReq("id-10k", 2));
    const code = (await res.json().catch(() => ({}))).code;
    expect(code).not.toBe("PARTICIPANT_COUNT");
  });

  it("a Duo Challenge with one runner is refused with a clear message", async () => {
    const { db, writes } = categoryDb({ ...ACTIVE_SOLO, id: "id-duo", name: "5K Duo Challenge", category_type: "duo" });
    mockDb.mockReturnValue(db);
    const res = await registerPost(registerReq("id-duo", 1));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exactly 2 runners/);
    expect(writes).toEqual([]);
  });

  it("a Parent & Child registration with one participant is refused", async () => {
    const { db, writes } = categoryDb(ACTIVE_KID);
    mockDb.mockReturnValue(db);
    const res = await registerPost(registerReq("id-kid", 1));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PARTICIPANT_COUNT");
    expect(writes).toEqual([]);
  });

  it("a Parent & Child registration with two participants passes the count check", async () => {
    const { db } = categoryDb(ACTIVE_KID);
    mockDb.mockReturnValue(db);
    const res = await registerPost(registerReq("id-kid", 2));
    expect((await res.json()).code).not.toBe("PARTICIPANT_COUNT");
  });
});

describe("a saved draft cannot be reused for another category", () => {
  beforeEach(() => jest.clearAllMocks());

  function draftReq(token: string, selectedCatId: string) {
    return new NextRequest("http://t/api/it-run/drafts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token, expectedVersion: 1,
        draft: { step: 2, participantSubIdx: 0, selectedCatId, couponCode: "", participants: [{ firstName: "A" }] },
      }),
    });
  }

  it("saving 10K into a Parent & Child draft is refused without writing", async () => {
    const token = newDraftToken();
    const kidDraft = {
      id: "d1", status: "open", version: 1, expires_at: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
      saved_at: "2026-10-09T00:00:00Z", owner_email: null,
      state: { step: 2, participantSubIdx: 0, selectedCatId: "id-kid", couponCode: "", participants: [] },
    };
    const { db, writes } = categoryDb(ACTIVE_SOLO, kidDraft);
    mockDb.mockReturnValue(db);

    const res = await draftPost(draftReq(token, "id-10k"));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DRAFT_CATEGORY_MISMATCH");
    expect(writes).not.toContain("it_run_drafts");
    expect(hashDraftToken(token)).toBeTruthy();
  });
});
