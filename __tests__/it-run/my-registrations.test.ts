/**
 * My Registrations: the API returns only the signed-in account's registrations, with each participant once,
 * lets the account claim registrations made with its own email (only unlinked ones), and the client shows
 * explicit states for loading, session expiry, failure, and empty results.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => ({
  verifyUserToken: jest.fn(),
  USER_SESSION_COOKIE: "cs_user_session",
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { GET } from "@/app/api/it-run/my-registrations/route";
import { POST as claimPost } from "@/app/api/it-run/my-registrations/claim/route";
import {
  buildMyRegistrations,
  claimEmailVariants,
  discountLabel,
  paymentStatusView,
  registrationNote,
  canOfferCategoryChange,
  canRequestRefund,
  parseMyRegistrations,
  parseClaimableCount,
  loadFailureMessage,
  type MyRegistrationRow,
  type MyRegParticipantRow,
} from "@/lib/it-run-my-registrations";

const mockDb = getSupabaseServer as jest.Mock;
const mockVerify = verifyUserToken as jest.Mock;

const OWNER = "asha@example.com";

const CAT = { name: "5K Timed Run", distance_km: 5, color: "#e8620a", category_type: "solo" };
const EVENT = { title: "The IT Run Sprint-2", event_date: "2027-02-07" };

function reg(over: Partial<MyRegistrationRow> = {}): MyRegistrationRow {
  return {
    id: "reg-1", registration_code: "ITR-AAA", payment_status: "paid", registration_status: "active",
    final_price: 799, base_price: 799, discount_amount: 0, early_bird_offer_id: null,
    participant_count: 1, created_at: "2026-10-01T10:00:00Z", category: CAT, event: EVENT, ...over,
  };
}

function part(over: Partial<MyRegParticipantRow> = {}): MyRegParticipantRow {
  return {
    id: "p-1", registration_id: "reg-1", first_name: "Asha", last_name: "Rao", participant_type: "solo",
    bib_number: "5K-001", qr_token: "qr-1", verification_status: "verified", ...over,
  };
}

// ── Pure assembly ─────────────────────────────────────────────────────────────

describe("buildMyRegistrations", () => {
  it("returns one registration with its participants, no duplicates from joins", () => {
    const out = buildMyRegistrations(
      [reg()],
      [part(), part({ id: "p-1" })], // same participant twice (a join artefact)
      [{ participant_id: "p-1", collected_at: "2027-02-06T09:00:00Z" }, { participant_id: "p-1", collected_at: "2027-02-06T09:05:00Z" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].participants).toHaveLength(1);
    expect(out[0].participants[0].collected_at).toBe("2027-02-06T09:00:00Z");
  });

  it("keeps a multi-participant booking together and each participant's own BIB and QR", () => {
    const out = buildMyRegistrations(
      [reg({ participant_count: 2, category: { ...CAT, name: "Parent & Child Duo" } })],
      [
        part({ id: "p-1", first_name: "Asha", participant_type: "parent", bib_number: "5K-001", qr_token: "qr-a" }),
        part({ id: "p-2", first_name: "Ravi", participant_type: "child", bib_number: "5K-002", qr_token: "qr-b" }),
      ],
      [],
    );
    expect(out[0].participants.map(p => [p.first_name, p.bib_number, p.qr_token])).toEqual([
      ["Asha", "5K-001", "qr-a"],
      ["Ravi", "5K-002", "qr-b"],
    ]);
    expect(out[0].participants[0].collected_at).toBeNull();
  });

  it("returns several registrations separately and never mixes participants between them", () => {
    const out = buildMyRegistrations(
      [reg({ id: "reg-1" }), reg({ id: "reg-2", registration_code: "ITR-BBB" })],
      [part({ id: "p-1", registration_id: "reg-1" }), part({ id: "p-2", registration_id: "reg-2", first_name: "Meera" })],
      [],
    );
    expect(out.map(r => [r.id, r.participants.map(p => p.first_name)])).toEqual([
      ["reg-1", ["Asha"]],
      ["reg-2", ["Meera"]],
    ]);
  });

  it("keeps a registration with no participant rows as an empty list rather than dropping it", () => {
    const out = buildMyRegistrations([reg()], [], []);
    expect(out).toHaveLength(1);
    expect(out[0].participants).toEqual([]);
  });

  it("keeps unpaid and failed registrations visible (never hidden for payment state)", () => {
    const out = buildMyRegistrations(
      [reg({ id: "a", payment_status: "pending" }), reg({ id: "b", payment_status: "expired" })],
      [], [],
    );
    expect(out.map(r => r.payment_status)).toEqual(["pending", "expired"]);
  });

  it("sets the server-decided action flags on each registration", () => {
    const out = buildMyRegistrations(
      [
        reg({ id: "paid", payment_status: "paid" }),
        reg({ id: "pending", payment_status: "pending" }),
        reg({ id: "cancelled", payment_status: "paid", registration_status: "cancelled" }),
      ],
      [], [],
    );
    expect(out.map(r => [r.id, r.actions])).toEqual([
      ["paid", { canChangeCategory: true, canRequestRefund: true }],
      ["pending", { canChangeCategory: false, canRequestRefund: false }],
      ["cancelled", { canChangeCategory: false, canRequestRefund: false }],
    ]);
  });
});

// ── Status presentation and rules ─────────────────────────────────────────────

describe("payment and registration status presentation", () => {
  it("shows only paid or free registrations as confirmed", () => {
    expect(paymentStatusView("paid", "active").label).toBe("Confirmed");
    expect(paymentStatusView("free", "active").label).toBe("Confirmed (free)");
    expect(paymentStatusView("pending", "active").label).toBe("Awaiting payment");
    expect(paymentStatusView("payment_attempted", "active").label).toBe("Payment in progress");
    expect(paymentStatusView("failed", "active").label).toBe("Payment failed");
    expect(paymentStatusView("expired", "active").label).toBe("Payment expired");
  });

  it("labels every refund state the database allows", () => {
    expect(paymentStatusView("refunded", "cancelled").label).toBe("Cancelled");
    expect(paymentStatusView("refunded", "active").label).toBe("Refunded");
    expect(paymentStatusView("partially_refunded", "active").label).toBe("Partly refunded");
  });

  it("falls back to a neutral label for an unknown status instead of showing it as failed or confirmed", () => {
    expect(paymentStatusView("something_new", "active").label).toBe("Status unavailable");
  });

  it("explains an unpaid or failed registration in a note", () => {
    expect(registrationNote({ payment_status: "pending", registration_status: "active" })).toMatch(/not confirmed/);
    expect(registrationNote({ payment_status: "failed", registration_status: "active" })).toMatch(/not confirmed/);
    expect(registrationNote({ payment_status: "paid", registration_status: "active" })).toBeNull();
    expect(registrationNote({ payment_status: "paid", registration_status: "cancelled" })).toMatch(/cancelled/);
  });

  it("offers category change only for an active paid or free registration", () => {
    expect(canOfferCategoryChange({ payment_status: "paid", registration_status: "active" })).toBe(true);
    expect(canOfferCategoryChange({ payment_status: "free", registration_status: "active" })).toBe(true);
    expect(canOfferCategoryChange({ payment_status: "pending", registration_status: "active" })).toBe(false);
    expect(canOfferCategoryChange({ payment_status: "paid", registration_status: "cancelled" })).toBe(false);
  });

  it("offers a refund request only for an active paid registration with an amount", () => {
    expect(canRequestRefund({ payment_status: "paid", registration_status: "active", final_price: 799 })).toBe(true);
    expect(canRequestRefund({ payment_status: "partially_refunded", registration_status: "active", final_price: 400 })).toBe(true);
    expect(canRequestRefund({ payment_status: "free", registration_status: "active", final_price: 0 })).toBe(false);
    expect(canRequestRefund({ payment_status: "pending", registration_status: "active", final_price: 799 })).toBe(false);
    expect(canRequestRefund({ payment_status: "paid", registration_status: "cancelled", final_price: 799 })).toBe(false);
  });
});

// ── Claim helpers ─────────────────────────────────────────────────────────────

describe("discountLabel and pricing", () => {
  it("names the early bird offer, labels a coupon, and returns null with no discount", () => {
    const offers = new Map([["offer-1", "Early Bird — 5K Timed Run"]]);
    expect(discountLabel({ discount_amount: 119, early_bird_offer_id: "offer-1" }, offers)).toBe("Early Bird — 5K Timed Run");
    expect(discountLabel({ discount_amount: 100, early_bird_offer_id: null }, offers)).toBe("Discount code");
    expect(discountLabel({ discount_amount: 0, early_bird_offer_id: null }, offers)).toBeNull();
  });

  it("falls back to 'Early bird' when the offer name is unavailable", () => {
    expect(discountLabel({ discount_amount: 119, early_bird_offer_id: "gone" }, new Map())).toBe("Early bird");
  });

  it("puts base price, discount label, and discount on each registration", () => {
    const out = buildMyRegistrations(
      [reg({ id: "eb", final_price: 680, base_price: 799, discount_amount: 119, early_bird_offer_id: "offer-1" })],
      [], [], new Map([["offer-1", "Early Bird — 5K Timed Run"]]),
    );
    expect(out[0].pricing).toEqual({ base_price: 799, discount_amount: 119, discount_label: "Early Bird — 5K Timed Run" });
  });

  it("shows no discount label for a full-price registration", () => {
    const out = buildMyRegistrations([reg()], [], []);
    expect(out[0].pricing).toEqual({ base_price: 799, discount_amount: 0, discount_label: null });
  });
});

describe("claimEmailVariants", () => {
  it("matches the email as typed and in lower case, and nothing else", () => {
    expect(claimEmailVariants("  Asha@Example.com ")).toEqual(["Asha@Example.com", "asha@example.com"]);
    expect(claimEmailVariants("asha@example.com")).toEqual(["asha@example.com"]);
  });
});

describe("parseClaimableCount", () => {
  it("returns a positive integer count and 0 for anything else", () => {
    expect(parseClaimableCount({ claimable: 2 })).toBe(2);
    expect(parseClaimableCount({ claimable: 0 })).toBe(0);
    expect(parseClaimableCount({ claimable: -1 })).toBe(0);
    expect(parseClaimableCount({ claimable: 1.5 })).toBe(0);
    expect(parseClaimableCount({ claimable: "3" })).toBe(0);
    expect(parseClaimableCount({})).toBe(0);
    expect(parseClaimableCount(null)).toBe(0);
  });
});

// ── Response validation and error messages ────────────────────────────────────

describe("parseMyRegistrations", () => {
  const valid = {
    id: "reg-1", registration_code: "ITR-AAA", payment_status: "paid", registration_status: "active",
    final_price: 799, participant_count: 1, created_at: "2026-10-01T10:00:00Z",
    category: CAT, event: EVENT,
    pricing: { base_price: 799, discount_amount: 0, discount_label: null },
    participants: [{ id: "p-1", first_name: "Asha", last_name: "Rao", participant_type: "solo", bib_number: null, qr_token: null, verification_status: "pending", collected_at: null }],
    actions: { canChangeCategory: true, canRequestRefund: true },
  };

  it("accepts a well-formed list", () => {
    expect(parseMyRegistrations({ registrations: [valid] })).toHaveLength(1);
  });

  it("accepts an empty list", () => {
    expect(parseMyRegistrations({ registrations: [] })).toEqual([]);
  });

  it("accepts null category and event (a registration whose category or event row is missing)", () => {
    expect(parseMyRegistrations({ registrations: [{ ...valid, category: null, event: null }] })).toHaveLength(1);
  });

  it("rejects a non-object body, a missing list, or a non-array list", () => {
    expect(parseMyRegistrations(null)).toBeNull();
    expect(parseMyRegistrations("oops")).toBeNull();
    expect(parseMyRegistrations({})).toBeNull();
    expect(parseMyRegistrations({ registrations: "nope" })).toBeNull();
  });

  it("rejects the whole list when one row is malformed, so a partial list is never shown as complete", () => {
    expect(parseMyRegistrations({ registrations: [valid, { ...valid, final_price: "799" }] })).toBeNull();
    expect(parseMyRegistrations({ registrations: [valid, { ...valid, participants: [{ id: "p" }] }] })).toBeNull();
    expect(parseMyRegistrations({ registrations: [null] })).toBeNull();
  });

  it("rejects a registration without its pricing block", () => {
    const noPricing: Record<string, unknown> = { ...valid };
    delete noPricing.pricing;
    expect(parseMyRegistrations({ registrations: [noPricing] })).toBeNull();
  });

  it("rejects a registration without its action flags", () => {
    const noActions: Record<string, unknown> = { ...valid };
    delete noActions.actions;
    expect(parseMyRegistrations({ registrations: [noActions] })).toBeNull();
    expect(parseMyRegistrations({ registrations: [{ ...valid, actions: { canChangeCategory: "yes", canRequestRefund: true } }] })).toBeNull();
  });
});

describe("loadFailureMessage", () => {
  it("gives every failure kind a user-facing message without internal details", () => {
    for (const kind of ["session", "server", "malformed", "network"] as const) {
      const msg = loadFailureMessage(kind);
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).not.toMatch(/supabase|postgres|PGRST|stack|query|column|token/i);
    }
  });
});

// ── Database fake ─────────────────────────────────────────────────────────────

type Spec = { data?: unknown; error?: { code?: string; message: string } | null };

/**
 * Fake PostgREST builder. Every call is recorded so tests can check exactly what was asked of the database.
 * `responses` gives each table one response, or a queue used in call order (the last item repeats).
 */
function fakeDb(responses: Record<string, Spec | Spec[]>) {
  const log: Array<{ table: string; method: string; args: unknown[] }> = [];
  const queues = new Map<string, Spec[]>();
  for (const [table, v] of Object.entries(responses)) queues.set(table, Array.isArray(v) ? [...v] : [v]);
  const next = (table: string): Spec => {
    const q = queues.get(table);
    if (!q || q.length === 0) return { data: [], error: null };
    return q.length > 1 ? (q.shift() as Spec) : q[0];
  };
  return {
    log,
    from(table: string) {
      const b: any = {};
      for (const m of ["select", "eq", "in", "is", "order", "update", "insert"]) {
        b[m] = (...args: unknown[]) => { log.push({ table, method: m, args }); return b; };
      }
      b.returns = () => Promise.resolve(next(table));
      b.then = (res: any, rej?: any) => Promise.resolve(next(table)).then(res, rej);
      return b;
    },
  };
}

function req(url = "http://t/api/it-run/my-registrations", token?: string) {
  return new NextRequest(url, { headers: token ? { cookie: `cs_user_session=${token}` } : {} });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

// ── API route: list ───────────────────────────────────────────────────────────

describe("GET /api/it-run/my-registrations", () => {
  it("returns 401 with no session, and does not query the database", async () => {
    mockVerify.mockReturnValue(null);
    const db = fakeDb({});
    mockDb.mockReturnValue(db);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it("returns 401 for an invalid or expired session token", async () => {
    mockVerify.mockReturnValue(null);
    mockDb.mockReturnValue(fakeDb({}));
    const res = await GET(req("http://t/api/it-run/my-registrations", "bad.token.here"));
    expect(res.status).toBe(401);
  });

  it("filters registrations by the signed-in email only, ignoring any email in the URL", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({
      it_run_registrations: [{ data: [reg()] }, { data: [] }],
      it_run_participants: { data: [part()] },
      it_run_bib_collections: { data: [] },
    });
    mockDb.mockReturnValue(db);
    await GET(req(`http://t/api/it-run/my-registrations?email=someone-else@example.com&linked_user_email=someone-else@example.com`, "tok"));
    const filters = db.log.filter(l => l.table === "it_run_registrations" && l.method === "eq");
    expect(filters).toEqual([{ table: "it_run_registrations", method: "eq", args: ["linked_user_email", OWNER] }]);
    expect(JSON.stringify(db.log)).not.toContain("someone-else");
  });

  it("returns an existing user's legacy registrations with participants, BIBs, and collection state", async () => {
    mockVerify.mockReturnValue(OWNER);
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: [{ data: [reg({ id: "reg-1" }), reg({ id: "reg-2", registration_code: "ITR-BBB", payment_status: "pending" })] }, { data: [] }],
      it_run_participants: { data: [part({ id: "p-1", registration_id: "reg-1" }), part({ id: "p-2", registration_id: "reg-2", first_name: "Meera", bib_number: null })] },
      it_run_bib_collections: { data: [{ participant_id: "p-1", collected_at: "2027-02-06T09:00:00Z" }] },
    }));
    const res = await GET(req("http://t/x", "tok"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.registrations.map((r: any) => r.registration_code)).toEqual(["ITR-AAA", "ITR-BBB"]);
    expect(body.registrations[0].participants[0]).toMatchObject({ first_name: "Asha", bib_number: "5K-001", qr_token: "qr-1", collected_at: "2027-02-06T09:00:00Z" });
    expect(body.registrations[1].payment_status).toBe("pending");
    expect(body.registrations[1].participants[0].collected_at).toBeNull();
    expect(body.registrations[1].actions).toEqual({ canChangeCategory: false, canRequestRefund: false });
  });

  it("does not expose the account email or lead email in the response", async () => {
    mockVerify.mockReturnValue(OWNER);
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: [{ data: [{ ...reg(), lead_email: OWNER, linked_user_email: OWNER }] }, { data: [] }],
      it_run_participants: { data: [part()] },
    }));
    const body = await (await GET(req("http://t/x", "tok"))).json();
    expect(JSON.stringify(body)).not.toContain(OWNER);
  });

  it("returns an empty list, and makes no participant queries, when the account has no registrations", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({ it_run_registrations: { data: [] } });
    mockDb.mockReturnValue(db);
    const res = await GET(req("http://t/x", "tok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registrations: [], claimable: 0, participantChangesOpen: true });
    expect(db.log.some(l => l.table === "it_run_participants")).toBe(false);
  });

  it("returns a generic 500 when the registrations query fails, with no database detail in the body", async () => {
    mockVerify.mockReturnValue(OWNER);
    mockDb.mockReturnValue(fakeDb({ it_run_registrations: { data: null, error: { code: "PGRST200", message: "Could not find a relationship between it_run_registrations and it_run_bib_collections" } } }));
    const res = await GET(req("http://t/x", "tok"));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("Failed to load registrations");
    expect(text).not.toMatch(/relationship|PGRST|bib_collections/);
  });

  it("returns a generic 500 when the participants or BIB collections query fails", async () => {
    mockVerify.mockReturnValue(OWNER);
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: [{ data: [reg()] }, { data: [] }],
      it_run_participants: { data: null, error: { code: "42703", message: "column does not exist" } },
    }));
    expect((await GET(req("http://t/x", "tok"))).status).toBe(500);

    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: [{ data: [reg()] }, { data: [] }],
      it_run_participants: { data: [part()] },
      it_run_bib_collections: { data: null, error: { message: "timeout" } },
    }));
    expect((await GET(req("http://t/x", "tok"))).status).toBe(500);
  });

  it("returns one row per registration even when the collection query repeats a participant", async () => {
    mockVerify.mockReturnValue(OWNER);
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: [{ data: [reg()] }, { data: [] }],
      it_run_participants: { data: [part()] },
      it_run_bib_collections: { data: [
        { participant_id: "p-1", collected_at: "2027-02-06T09:00:00Z" },
        { participant_id: "p-1", collected_at: "2027-02-06T09:00:00Z" },
      ] },
    }));
    const body = await (await GET(req("http://t/x", "tok"))).json();
    expect(body.registrations).toHaveLength(1);
    expect(body.registrations[0].participants).toHaveLength(1);
  });

  it("never embeds BIB collections under registrations (the relationship does not exist)", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({ it_run_registrations: [{ data: [reg()] }, { data: [] }], it_run_participants: { data: [part()] } });
    mockDb.mockReturnValue(db);
    await GET(req("http://t/x", "tok"));
    const regSelect = db.log.find(l => l.table === "it_run_registrations" && l.method === "select")?.args[0] as string;
    expect(regSelect).not.toMatch(/it_run_bib_collections|bib_number/);
  });

  it("gives one user no access to another user's registration (filter is the session identity only)", async () => {
    mockVerify.mockImplementation((t: string) => (t === "token-of-b" ? "b@example.com" : null));
    const db = fakeDb({ it_run_registrations: { data: [] } });
    mockDb.mockReturnValue(db);
    const res = await GET(req("http://t/x?registration_id=reg-a", "token-of-b"));
    expect(res.status).toBe(200);
    expect(db.log.find(l => l.table === "it_run_registrations" && l.method === "eq")?.args).toEqual(["linked_user_email", "b@example.com"]);
  });

  it("counts registrations made with the account's email that no account has claimed", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({
      it_run_registrations: [{ data: [reg()] }, { data: [{ id: "x" }, { id: "y" }] }],
      it_run_participants: { data: [part()] },
    });
    mockDb.mockReturnValue(db);
    const body = await (await GET(req("http://t/x", "tok"))).json();
    expect(body.claimable).toBe(2);
    expect(db.log).toContainEqual({ table: "it_run_registrations", method: "in", args: ["lead_email", [OWNER]] });
    expect(db.log).toContainEqual({ table: "it_run_registrations", method: "is", args: ["linked_user_email", null] });
  });

  it("still returns the list when the claimable count fails, reporting 0", async () => {
    mockVerify.mockReturnValue(OWNER);
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: [{ data: [reg()] }, { data: null, error: { code: "XX000", message: "boom" } }],
      it_run_participants: { data: [part()] },
    }));
    const res = await GET(req("http://t/x", "tok"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registrations).toHaveLength(1);
    expect(body.claimable).toBe(0);
  });
});

describe("GET /api/it-run/my-registrations early bird pricing", () => {
  it("returns the early bird name with the base price and discount for an early bird booking", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({
      it_run_registrations: [{ data: [reg({ final_price: 680, base_price: 799, discount_amount: 119, early_bird_offer_id: "offer-1" })] }, { data: [] }],
      it_run_participants: { data: [part()] },
      it_run_early_bird_offers: { data: [{ id: "offer-1", name: "Early Bird — 5K Timed Run" }] },
    });
    mockDb.mockReturnValue(db);
    const body = await (await GET(req("http://t/x", "tok"))).json();
    expect(body.registrations[0].pricing).toEqual({ base_price: 799, discount_amount: 119, discount_label: "Early Bird — 5K Timed Run" });
    expect(db.log).toContainEqual({ table: "it_run_early_bird_offers", method: "in", args: ["id", ["offer-1"]] });
  });

  it("makes no offer lookup when no registration has an early bird", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({ it_run_registrations: [{ data: [reg()] }, { data: [] }], it_run_participants: { data: [part()] } });
    mockDb.mockReturnValue(db);
    await GET(req("http://t/x", "tok"));
    expect(db.log.some(l => l.table === "it_run_early_bird_offers")).toBe(false);
  });
});

// ── API route: claim ──────────────────────────────────────────────────────────

describe("POST /api/it-run/my-registrations/claim", () => {
  function claimReq(body?: unknown, token?: string) {
    return new NextRequest("http://t/api/it-run/my-registrations/claim", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { cookie: `cs_user_session=${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("returns 401 with no session and changes nothing", async () => {
    mockVerify.mockReturnValue(null);
    const db = fakeDb({});
    mockDb.mockReturnValue(db);
    const res = await claimPost(claimReq({}));
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it("links only registrations whose lead email matches the session email and that have no account", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({
      it_run_registrations: { data: [{ id: "reg-1", event_id: "ev-1" }] },
      it_run_audit_logs: { data: null },
    });
    mockDb.mockReturnValue(db);
    const res = await claimPost(claimReq(undefined, "tok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, linked: 1 });

    expect(db.log).toContainEqual({ table: "it_run_registrations", method: "update", args: [{ linked_user_email: OWNER }] });
    expect(db.log).toContainEqual({ table: "it_run_registrations", method: "in", args: ["lead_email", [OWNER]] });
    expect(db.log).toContainEqual({ table: "it_run_registrations", method: "is", args: ["linked_user_email", null] });
  });

  it("ignores anything the request body says about the owner or the registration", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({ it_run_registrations: { data: [] } });
    mockDb.mockReturnValue(db);
    await claimPost(claimReq({ linked_user_email: "attacker@example.com", registration_id: "reg-victim", lead_email: "victim@example.com" }, "tok"));
    expect(JSON.stringify(db.log)).not.toMatch(/attacker|reg-victim|victim@example\.com/);
    expect(db.log.find(l => l.method === "update")?.args).toEqual([{ linked_user_email: OWNER }]);
  });

  it("writes one audit entry per claimed registration and none when nothing was claimed", async () => {
    mockVerify.mockReturnValue(OWNER);
    const db = fakeDb({
      it_run_registrations: { data: [{ id: "reg-1", event_id: "ev-1" }, { id: "reg-2", event_id: "ev-1" }] },
      it_run_audit_logs: { data: null },
    });
    mockDb.mockReturnValue(db);
    await claimPost(claimReq(undefined, "tok"));
    const audit = db.log.find(l => l.table === "it_run_audit_logs" && l.method === "insert")?.args[0] as any[];
    expect(audit.map(a => a.entity_id)).toEqual(["reg-1", "reg-2"]);
    expect(audit.every(a => a.actor_email === OWNER && a.action === "registration_claimed")).toBe(true);

    const empty = fakeDb({ it_run_registrations: { data: [] } });
    mockDb.mockReturnValue(empty);
    const res = await claimPost(claimReq(undefined, "tok"));
    expect(await res.json()).toEqual({ ok: true, linked: 0 });
    expect(empty.log.some(l => l.table === "it_run_audit_logs")).toBe(false);
  });

  it("returns a generic 500 when the update fails, with no database detail", async () => {
    mockVerify.mockReturnValue(OWNER);
    mockDb.mockReturnValue(fakeDb({ it_run_registrations: { data: null, error: { code: "23503", message: "fk violation users" } } }));
    const res = await claimPost(claimReq(undefined, "tok"));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/fk|users|violation/);
  });
});
