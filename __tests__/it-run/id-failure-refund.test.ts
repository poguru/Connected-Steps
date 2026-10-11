/**
 * ID-verification failure refunds: the amount rules, and the admin endpoint that opens the request.
 * Nothing is refunded by the endpoint; the refund is executed later with an explicit admin confirmation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.30",
}));
jest.mock("@/lib/it-run-refunds", () => ({
  ...jest.requireActual("@/lib/it-run-refunds"),
  getRefundedAmountPaise: jest.fn().mockResolvedValue(0),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { idFailureRefundPaise } from "@/lib/it-run-id-failure";
import { POST } from "@/app/api/it-run/admin/id-failure/route";

// ── Amount rules ────────────────────────────────────────────────────────────────

describe("idFailureRefundPaise", () => {
  it("company ID rejected at verification: refunds everything except the 4% platform charge", () => {
    const r = idFailureRefundPaise(99900, "company", "verification");
    expect(r).toEqual({ ok: true, refundPaise: 95904, retainedPaise: 3996 });
  });

  it("government ID failed at BIB collection: refunds 80%; the 20% is kept", () => {
    const r = idFailureRefundPaise(99900, "government", "bib_collection");
    expect(r).toEqual({ ok: true, refundPaise: 79920, retainedPaise: 19980 });
  });

  it("rounds the refund down to the paisa", () => {
    const r = idFailureRefundPaise(1001, "company", "verification");
    expect(r.ok && r.refundPaise).toBe(960);
    expect(r.ok && r.retainedPaise).toBe(41);
  });

  it("has no rule for a company ID failed on collection day, or a government ID rejected at verification", () => {
    expect(idFailureRefundPaise(99900, "company", "bib_collection").ok).toBe(false);
    expect(idFailureRefundPaise(99900, "government", "verification").ok).toBe(false);
  });

  it("has no rule for an unknown stage or a missing document type", () => {
    expect(idFailureRefundPaise(99900, "company", "anything").ok).toBe(false);
    expect(idFailureRefundPaise(99900, null, "verification").ok).toBe(false);
  });

  it("refuses a registration with nothing paid", () => {
    expect(idFailureRefundPaise(0, "company", "verification").ok).toBe(false);
  });
});

// ── Endpoint ────────────────────────────────────────────────────────────────────

const REG = {
  id: "r-1", event_id: "ev-1", payment_status: "paid", registration_status: "pending_verification",
  final_price: 999, amount_paid_paise: 99900, participant_count: 1,
};

function fakeDb(opts: { part?: Record<string, unknown> | null; insertError?: { code: string } | null } = {}) {
  const inserts: Array<{ table: string; payload: any }> = [];
  const part = opts.part === undefined
    ? { id: "p-1", event_id: "ev-1", registration_id: "r-1", verification_status: "rejected", id_document_type: "company" }
    : opts.part && { event_id: "ev-1", ...opts.part };
  return {
    inserts,
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = () => {
        if (table === "it_run_events") return Promise.resolve({ data: { id: "ev-1" }, error: null });
        if (table === "it_run_registrations") return Promise.resolve({ data: REG, error: null });
        if (table === "it_run_participants") return Promise.resolve({ data: part, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      b.insert = (p: any) => {
        inserts.push({ table, payload: p });
        if (table === "it_run_refund_requests") {
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: opts.insertError ? null : { id: "req-1" }, error: opts.insertError ?? null }) }) };
        }
        return Promise.resolve({ data: null, error: null });
      };
      return b;
    },
  };
}

function req(body: unknown) {
  return new NextRequest("http://t/api/it-run/admin/id-failure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD = { participant_id: "p-1", stage: "verification", reason: "Company ID is not a valid card" };

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("POST /api/it-run/admin/id-failure", () => {
  it("refuses a caller who is not an event admin", async () => {
    (requireRole as jest.Mock).mockReturnValue(null);
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
    const res = await POST(req(GOOD));
    expect(res.status).toBe(401);
  });

  it("refuses an unknown stage", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
    const res = await POST(req({ ...GOOD, stage: "anything" }));
    expect(res.status).toBe(400);
  });

  it("requires a real reason", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb());
    const res = await POST(req({ ...GOOD, reason: "no" }));
    expect(res.status).toBe(400);
  });

  it("does not record a company ID failure until the document has been rejected", async () => {
    const db = fakeDb({ part: { id: "p-1", registration_id: "r-1", verification_status: "pending", id_document_type: "company" } });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(409);
    expect(db.inserts).toEqual([]);
  });

  it("refuses a case with no refund rule, and records nothing", async () => {
    const db = fakeDb({ part: { id: "p-1", registration_id: "r-1", verification_status: "rejected", id_document_type: "government" } });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(422);
    expect(db.inserts).toEqual([]);
  });

  it("opens an id_failure request for 96% of a company ID rejection, and refunds nothing", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req(GOOD));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ refundPaise: 95904, retainedPaise: 3996, status: "requested" });
    const request = db.inserts.find(i => i.table === "it_run_refund_requests");
    expect(request?.payload).toMatchObject({
      request_kind: "id_failure", requested_amount_paise: 95904, target_category_id: null, status: "requested",
    });
    expect(db.inserts.some(i => i.table === "it_run_refunds")).toBe(false);
  });

  it("opens an 80% request for a government ID failed on collection day", async () => {
    const db = fakeDb({ part: { id: "p-1", registration_id: "r-1", verification_status: "verified", id_document_type: "government" } });
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    const res = await POST(req({ ...GOOD, stage: "bib_collection" }));
    expect((await res.json()).refundPaise).toBe(79920);
  });

  it("never writes the document path into the audit trail", async () => {
    const db = fakeDb();
    (getSupabaseServer as jest.Mock).mockReturnValue(db);
    await POST(req(GOOD));
    const audit = db.inserts.find(i => i.table === "it_run_audit_logs");
    expect(audit?.payload.action).toBe("id_failure_refund_requested");
    expect(JSON.stringify(audit?.payload)).not.toMatch(/\.(jpg|jpeg|png|webp|pdf)/);
  });

  it("reports an open request for the registration as a conflict", async () => {
    (getSupabaseServer as jest.Mock).mockReturnValue(fakeDb({ insertError: { code: "23505" } }));
    const res = await POST(req(GOOD));
    expect(res.status).toBe(409);
  });
});
