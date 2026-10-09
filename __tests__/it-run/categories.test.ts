/**
 * IT Run categories: one source of truth.
 *  - Landing cards are built from the category record (distance 1.5 stays 1.5).
 *  - No hardcoded category distances or lists remain on the landing or registration pages.
 *  - Admin edits are validated and revalidate the public pages.
 *  - Inactive categories cannot be used for new registrations.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */
import fs from "fs";
import path from "path";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.1",
  generateRegistrationCode: () => "ITR-TEST",
  signItRunQR: () => "qr",
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: jest.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.1",
}));
jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { categoryCard, formatDistance, type ApiCategory } from "@/lib/it-run-category-view";
import { PATCH as adminCategoryPatch } from "@/app/api/it-run/admin/categories/route";
import { POST as registerPost } from "@/app/api/it-run/register/route";

const mockDb = getSupabaseServer as jest.Mock;
const mockRole = requireRole as jest.Mock;
const ROOT = path.join(__dirname, "..", "..");

const KID: ApiCategory = {
  slug: "2k-kid", name: "2K Parent & Child Duo", distance_km: 1.5, category_type: "kid",
  price_rupees: 999, color: "#ec4899", includes_timing: false, includes_medal: true,
  includes_tshirt: true, includes_certificate: false,
};

// ── Mapping ────────────────────────────────────────────────────────────────────

describe("category cards come from the stored record", () => {
  it("shows the stored distance exactly: 1.5 km is 1.5 KM", () => {
    expect(categoryCard(KID).distance).toBe("1.5 KM");
    expect(formatDistance(1.5)).toBe("1.5 KM");
    expect(formatDistance(10)).toBe("10 KM");
  });

  it("takes name, price, and type from the record", () => {
    const card = categoryCard(KID);
    expect(card).toMatchObject({ slug: "2k-kid", name: "2K Parent & Child Duo", price: 999, type: "kid" });
  });

  it("derives included benefits from the stored flags", () => {
    expect(categoryCard(KID).includes).toEqual(["Race BIB", "Dry-fit T-Shirt", "Finisher Medal"]);
    expect(categoryCard({ ...KID, includes_timing: true, includes_certificate: true }).includes).toContain("Chip Timing");
  });

  it("falls back to a safe colour when the stored colour is not a hex value", () => {
    expect(categoryCard({ ...KID, color: "javascript:alert(1)" }).color).toBe("#e8620a");
  });
});

// ── No hardcoded copies ────────────────────────────────────────────────────────

describe("no second copy of category details in the UI", () => {
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  it("the landing page has no static category list or literal distances", () => {
    const src = read("app/it-run/page.tsx");
    expect(src).not.toMatch(/const CATEGORIES/);
    expect(src).not.toMatch(/distance:\s*"\d/);
    expect(src).not.toMatch(/"2 KM"|"5 KM"|"10 KM"/);
  });

  it("the registration page does not override the stored distance", () => {
    const src = read("app/it-run/register/page.tsx");
    expect(src).not.toMatch(/distance_km\s*<\s*2/);
    expect(src).not.toMatch(/"1\.5 KM"/);
  });

  it("the migration sets the Parent & Child distance to 1.5 and touches no registrations or payments", () => {
    const sql = read("supabase/migrations/20261010000002_kid_category_distance.sql");
    expect(sql).toMatch(/SET distance_km = 1\.5/);
    expect(sql).toMatch(/slug = '2k-kid'/);
    expect(sql).not.toMatch(/it_run_registrations|it_run_participants|razorpay|price_rupees\s*=/i);
  });
});

// ── Admin edits ────────────────────────────────────────────────────────────────

function adminRequest(body: unknown) {
  return new NextRequest("http://t/api/it-run/admin/categories", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

function adminDb(current: Record<string, unknown> = { id: "cat-1", name: "2K", distance_km: 2, price_rupees: 999, max_participants: null }) {
  const updates: any[] = [];
  return {
    updates,
    db: {
      from(table: string) {
        const b: any = {
          select() { return b; },
          eq() { return b; },
          in() { return b; },
          single() { return Promise.resolve({ data: current, error: null }); },
          update(p: unknown) { updates.push({ table, payload: p }); return b; },
          insert() { return Promise.resolve({ data: null, error: null }); },
          then(res: (v: any) => unknown, rej?: (e: unknown) => unknown) {
            return Promise.resolve({ data: null, error: null, count: 0 }).then(res, rej);
          },
        };
        // The update chain ends in .select().single()
        b.select = () => b;
        return b;
      },
    },
  };
}

describe("PATCH /api/it-run/admin/categories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole.mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  });

  it("refuses a distance that is not a number", async () => {
    const fake = adminDb();
    mockDb.mockReturnValue(fake.db);
    const res = await adminCategoryPatch(adminRequest({ id: "cat-1", distance_km: "abc" }));
    expect(res.status).toBe(400);
    expect(fake.updates).toHaveLength(0);
  });

  it("refuses a fractional rupee price", async () => {
    const fake = adminDb();
    mockDb.mockReturnValue(fake.db);
    const res = await adminCategoryPatch(adminRequest({ id: "cat-1", price_rupees: "999.5" }));
    expect(res.status).toBe(400);
    expect(fake.updates).toHaveLength(0);
  });

  it("saves a valid distance as a number and revalidates the public pages", async () => {
    const fake = adminDb();
    mockDb.mockReturnValue(fake.db);

    const res = await adminCategoryPatch(adminRequest({ id: "cat-1", distance_km: "1.5" }));

    expect(res.status).toBe(200);
    expect(fake.updates[0].payload).toEqual({ distance_km: 1.5 });
    expect(revalidatePath).toHaveBeenCalledWith("/it-run");
    expect(revalidatePath).toHaveBeenCalledWith("/it-run/register");
  });

  it("does not revalidate when the save fails", async () => {
    // The read succeeds; the write (the chain that includes update) returns a database error
    const db = {
      from() {
        const b: any = { updating: false };
        b.select = () => b;
        b.eq = () => b;
        b.in = () => b;
        b.update = () => { b.updating = true; return b; };
        b.insert = () => Promise.resolve({ data: null, error: null });
        b.single = () => (b.updating
          ? Promise.resolve({ data: null, error: { message: "boom" } })
          : Promise.resolve({ data: { id: "cat-1", distance_km: 2, price_rupees: 999 }, error: null }));
        return b;
      },
    };
    mockDb.mockReturnValue(db);

    const res = await adminCategoryPatch(adminRequest({ id: "cat-1", distance_km: "1.5" }));

    expect(res.status).toBe(500);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ── Registration uses the authoritative record ─────────────────────────────────

describe("registration refuses inactive categories", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 and writes nothing for an inactive category", async () => {
    const writes: string[] = [];
    mockDb.mockReturnValue({
      from(table: string) {
        const b: any = {
          select() { return b; }, eq() { return b; },
          insert() { writes.push(table); return b; },
          update() { writes.push(table); return b; },
          single() {
            if (table === "it_run_categories") {
              return Promise.resolve({ data: { id: "cat-1", event_id: "ev", name: "5K", category_type: "solo", price_rupees: 799, max_participants: null, is_active: false }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          maybeSingle() { return this.single(); },
          then(res: (v: any) => unknown) { return Promise.resolve({ data: null, error: null }).then(res); },
        };
        return b;
      },
      rpc() { writes.push("rpc"); return Promise.resolve({ data: null, error: null }); },
    });

    const res = await registerPost(new NextRequest("http://t/api/it-run/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: "cat-1", couponId: null, participants: [{ firstName: "A" }] }),
    }));

    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });
});
