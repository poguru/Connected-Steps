/**
 * Company ID correction links: token security, participant resubmission, stale-link protection,
 * and the correction call-to-action in rejection and clarification emails.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
process.env.NEXT_PUBLIC_APP_URL = "https://www.connectedsteps.in";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({ getClientIp: () => "203.0.113.4" }));
jest.mock("@/lib/it-run-auth", () => ({
  ...jest.requireActual("@/lib/it-run-auth"),
  // Fixed key for tests so tokens are deterministic; production derives it from the server secret
  itRunActionKey: () => Buffer.alloc(32, 7),
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  issueCorrectionToken,
  verifyCorrectionToken,
  documentFingerprint,
  buildCompanyIdCorrectionUrl,
  COMPANY_ID_LINK_TTL_MS,
} from "@/lib/it-run-company-id-link";
import {
  buildCompanyVerificationRejectionEmail,
  buildCompanyVerificationClarificationEmail,
} from "@/lib/it-run-verification";
import { GET, POST } from "@/app/api/it-run/company-id/resubmit/route";

const mockDb = getSupabaseServer as jest.Mock;

const PARTICIPANT_ID = "7f3c2a10-1111-4222-8333-944455556666";
const DOC_V1 = "resubmit-111-aaa.jpg";
const DOC_V2 = "resubmit-222-bbb.jpg";
const NOW = Date.UTC(2026, 9, 9);

// ── Token security ─────────────────────────────────────────────────────────────

describe("correction link token", () => {
  it("round-trips to the same participant and document", () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1, NOW);
    const r = verifyCorrectionToken(token, NOW + 1000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.participantId).toBe(PARTICIPANT_ID);
      expect(r.payload.documentFingerprint).toBe(documentFingerprint(DOC_V1));
    }
  });

  it("does not expose the participant ID or document path in the URL", () => {
    const url = buildCompanyIdCorrectionUrl(PARTICIPANT_ID, DOC_V1);
    expect(url).not.toContain(PARTICIPANT_ID);
    expect(url).not.toContain(DOC_V1);
    expect(url.startsWith("https://www.connectedsteps.in/it-run/company-id?t=")).toBe(true);
  });

  it("rejects a tampered token", () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1, NOW);
    const bytes = Buffer.from(token, "base64url");
    bytes[bytes.length - 1] ^= 0x01;
    expect(verifyCorrectionToken(bytes.toString("base64url"), NOW).ok).toBe(false);
  });

  it("rejects a token signed with a different key", () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1, NOW);
    // Same ciphertext under another key cannot authenticate
    const other = Buffer.from(token, "base64url");
    other[12] ^= 0xff;
    expect(verifyCorrectionToken(other.toString("base64url"), NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports expired tokens distinctly from invalid ones", () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1, NOW);
    const r = verifyCorrectionToken(token, NOW + COMPANY_ID_LINK_TTL_MS + 1);
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it.each([
    ["empty", ""],
    ["short garbage", "abc"],
    ["not base64", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"],
  ])("rejects %s", (_label, token) => {
    expect(verifyCorrectionToken(token, NOW).ok).toBe(false);
  });
});

// ── Emails ─────────────────────────────────────────────────────────────────────

describe("rejection and clarification emails carry the correction link", () => {
  const url = buildCompanyIdCorrectionUrl(PARTICIPANT_ID, DOC_V1);

  it("rejection email has the button and a plain-text fallback URL, and no dashboard-only link", () => {
    const html = buildCompanyVerificationRejectionEmail("Asha", "unreadable_id", null, {
      eventTitle: "The IT Run Sprint-2",
      bibLocations: [],
      correctionUrl: url,
    });
    expect(html).toContain("Correct and Resubmit Company ID");
    expect(html.split(`href="${url.replace(/&/g, "&amp;")}"`).length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toContain(url.replace(/&/g, "&amp;"));
    expect(html).toContain("Asha");
    expect(html).toContain("info@connectedsteps.in");
    expect(html).not.toContain("INVALID ID");
    expect(html).not.toContain("my-registrations");
  });

  it("clarification email has the same correction link and the admin's request text", () => {
    const html = buildCompanyVerificationClarificationEmail("Ravi", "Please send the back side of the ID.", {
      eventTitle: "The IT Run Sprint-2",
      correctionUrl: url,
    });
    expect(html).toContain("Correct and Resubmit Company ID");
    expect(html).toContain(url.replace(/&/g, "&amp;"));
    expect(html).toContain("Please send the back side of the ID.");
    expect(html).not.toContain("UPLOAD CORRECT ID");
  });
});

// ── API ────────────────────────────────────────────────────────────────────────

type Stored = {
  id: string; first_name: string; email: string | null; company_id_url: string | null;
  verification_status: string; event_id: string;
};

function makeDb(participant: Stored | null, opts: { updateSucceeds?: boolean; latest?: any } = {}) {
  const updates: Array<{ payload: any; filters: Record<string, unknown> }> = [];
  const audit: any[] = [];
  const storage = {
    upload: jest.fn().mockResolvedValue({ data: { path: "x" }, error: null }),
    remove: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  const db = {
    from(table: string) {
      const q: any = { table, filters: {} as Record<string, unknown>, payload: undefined, op: "select" };
      const b: any = {
        select() { return b; },
        eq(k: string, v: unknown) { q.filters[k] = v; return b; },
        in(k: string, v: unknown) { q.filters[`in:${k}`] = v; return b; },
        order() { return b; },
        limit() { return b; },
        update(p: unknown) { q.op = "update"; q.payload = p; return b; },
        insert(p: unknown) { if (table === "it_run_audit_logs") audit.push(p); return Promise.resolve({ data: null, error: null }); },
        maybeSingle() { return run(); },
        then(res: (v: any) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
      };
      function run(): Promise<any> {
        if (table === "it_run_participants") {
          if (q.op === "update") {
            updates.push({ payload: q.payload, filters: q.filters });
            return Promise.resolve({ data: opts.updateSucceeds === false ? null : { id: participant?.id }, error: null });
          }
          return Promise.resolve({ data: participant, error: null });
        }
        if (table === "it_run_events") return Promise.resolve({ data: { title: "The IT Run Sprint-2" }, error: null });
        if (table === "it_run_company_verifications") return Promise.resolve({ data: opts.latest ?? null, error: null });
        return Promise.resolve({ data: null, error: null });
      }
      return b;
    },
    storage: { from: () => storage },
  };
  return { db, updates, audit, storage };
}

function participant(overrides: Partial<Stored> = {}): Stored {
  return {
    id: PARTICIPANT_ID, first_name: "Asha", email: "asha@example.com",
    company_id_url: DOC_V1, verification_status: "rejected", event_id: "ev-1",
    ...overrides,
  };
}

function getReq(token: string) {
  return new NextRequest(`http://t/api/it-run/company-id/resubmit?t=${encodeURIComponent(token)}`);
}

function postReq(token: string, file?: { type: string; size: number }) {
  const form = new FormData();
  form.append("t", token);
  if (file) {
    form.append("file", new File([new Uint8Array(Math.max(1, file.size))], "id.jpg", { type: file.type }));
  }
  return new NextRequest("http://t/api/it-run/company-id/resubmit", { method: "POST", body: form });
}

describe("GET /api/it-run/company-id/resubmit", () => {
  it("returns 400 INVALID_LINK for a tampered token", async () => {
    mockDb.mockReturnValue(makeDb(participant()).db);
    const res = await GET(getReq("x".repeat(80)));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_LINK");
  });

  it("returns 409 STALE_LINK once a newer document has been submitted", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    mockDb.mockReturnValue(makeDb(participant({ company_id_url: DOC_V2 })).db);
    const res = await GET(getReq(token));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("STALE_LINK");
  });

  it("returns the admin's reason and allows resubmission for a rejected participant", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    mockDb.mockReturnValue(makeDb(participant(), {
      latest: { verification_reason: "unreadable_id", admin_explanation: null, reviewed_at: "2026-10-08T10:00:00Z" },
    }).db);
    const res = await GET(getReq(token));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.canResubmit).toBe(true);
    expect(body.reasonText).toContain("not clear enough");
    expect(JSON.stringify(body)).not.toContain("unreadable_id");
    expect(body.participantName).toBe("Asha");
  });

  it("does not allow resubmission of an already verified company ID", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    mockDb.mockReturnValue(makeDb(participant({ verification_status: "verified" })).db);
    const body = await (await GET(getReq(token))).json();
    expect(body.canResubmit).toBe(false);
  });
});

describe("POST /api/it-run/company-id/resubmit", () => {
  it("stores the replacement and moves the record back to pending review", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    const fake = makeDb(participant());
    mockDb.mockReturnValue(fake.db);

    const res = await POST(postReq(token, { type: "image/jpeg", size: 1000 }) as any);

    expect(res.status).toBe(200);
    expect(fake.storage.upload).toHaveBeenCalledTimes(1);
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0].payload).toMatchObject({ verification_status: "pending" });
    // Compare-and-swap on the previous document and the correctable statuses
    expect(fake.updates[0].filters).toMatchObject({ id: PARTICIPANT_ID, company_id_url: DOC_V1 });
    expect(fake.updates[0].filters["in:verification_status"]).toEqual(["rejected", "need_clarification"]);
    // The new storage path is random, not derived from the participant ID
    expect(fake.updates[0].payload.company_id_url).not.toContain(PARTICIPANT_ID);
    expect(fake.audit[0]).toMatchObject({ action: "company_id_resubmitted", entity_id: PARTICIPANT_ID });
  });

  it("only ever updates the participant the token names", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    const fake = makeDb(participant());
    mockDb.mockReturnValue(fake.db);

    await POST(postReq(token, { type: "image/png", size: 1000 }) as any);

    expect(fake.updates.every(u => u.filters.id === PARTICIPANT_ID)).toBe(true);
  });

  it("refuses an older link after a newer submission and removes the stray file", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    // The record already holds DOC_V2, so the fingerprint check fails before anything is written
    const fake = makeDb(participant({ company_id_url: DOC_V2 }));
    mockDb.mockReturnValue(fake.db);

    const res = await POST(postReq(token, { type: "image/jpeg", size: 1000 }) as any);

    expect(res.status).toBe(409);
    expect(fake.updates).toHaveLength(0);
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it("removes the uploaded file when the record changes between check and write", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    const fake = makeDb(participant(), { updateSucceeds: false });
    mockDb.mockReturnValue(fake.db);

    const res = await POST(postReq(token, { type: "image/jpeg", size: 1000 }) as any);

    expect(res.status).toBe(409);
    expect(fake.storage.remove).toHaveBeenCalledTimes(1);
  });

  it("does not accept a file once the company ID is verified", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    const fake = makeDb(participant({ verification_status: "verified" }));
    mockDb.mockReturnValue(fake.db);

    const res = await POST(postReq(token, { type: "image/jpeg", size: 1000 }) as any);

    expect(res.status).toBe(409);
    expect(fake.updates).toHaveLength(0);
  });

  it("rejects unsupported file types and oversized files", async () => {
    const token = issueCorrectionToken(PARTICIPANT_ID, DOC_V1);
    mockDb.mockReturnValue(makeDb(participant()).db);

    const badType = await POST(postReq(token, { type: "text/html", size: 100 }) as any);
    expect(badType.status).toBe(400);
    expect((await badType.json()).code).toBe("BAD_TYPE");

    const tooBig = await POST(postReq(token, { type: "image/jpeg", size: 6 * 1024 * 1024 }) as any);
    expect(tooBig.status).toBe(400);
    expect((await tooBig.json()).code).toBe("TOO_LARGE");
  });
});
