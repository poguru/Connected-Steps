/**
 * Admin manual registration. The admin route checks the role on the server, validates the waiver reason and the
 * idempotency key, and hands the registration to the shared function as an admin_manual source. Payment is never
 * marked paid here. Public registrations keep their columns, so the admin-only columns are added only for admin input.
 */

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { registrationSource } from "../helpers/registration-source";

const mockSession = { current: null as null | { email: string; role: string; exp: number } };
const mockCreate = jest.fn(async (_input: unknown) => ({ ok: true as const, body: { registrationCode: "IT-X", finalPrice: 0 } }));

jest.mock("@/lib/it-run-auth", () => ({
  requireRole: () => mockSession.current,
}));
jest.mock("@/lib/rate-limit", () => ({
  checkAndRecordEndpointLimit: async () => ({ limited: false, retryAfter: 0 }),
  getClientIp: () => "203.0.113.5",
}));
jest.mock("@/lib/it-run-register-core", () => ({
  createItRunRegistration: (input: unknown) => mockCreate(input),
}));

import { POST } from "@/app/api/it-run/admin/manual-registrations/route";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const KEY = "adminkey_20261026_abc";
const ADMIN = { email: "admin@example.com", role: "event_admin", exp: 0 };

const call = (body: unknown) => POST(new NextRequest("http://t/api/it-run/admin/manual-registrations", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

beforeEach(() => {
  mockSession.current = ADMIN;
  mockCreate.mockClear();
});

describe("who can create a manual registration", () => {
  it("refuses a request with no admin session", async () => {
    mockSession.current = null;
    const res = await call({ categoryId: "c1", participants: [], idempotencyKey: KEY });
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("what the route accepts", () => {
  it("needs a submission key from the form", async () => {
    expect((await call({ categoryId: "c1", participants: [{}] })).status).toBe(400);
    expect((await call({ categoryId: "c1", participants: [{}], idempotencyKey: "short" })).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("a complimentary registration needs a reason of 10 to 300 characters", async () => {
    expect((await call({ categoryId: "c1", participants: [{}], idempotencyKey: KEY, complimentary: true, waiverReason: "short" })).status).toBe(400);
    expect((await call({ categoryId: "c1", participants: [{}], idempotencyKey: KEY, complimentary: true, waiverReason: "x".repeat(301) })).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("a complimentary registration can't also take a discount code", async () => {
    const res = await call({ categoryId: "c1", participants: [{}], idempotencyKey: KEY, complimentary: true, waiverReason: "Sponsor's runner, approved by the director", couponId: "k1" });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("what reaches the shared registration function", () => {
  it("marks the source as admin_manual and records the admin who created it", async () => {
    await call({ categoryId: "c1", participants: [{ type: "solo" }], idempotencyKey: KEY });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      source: "admin_manual",
      linkedUserEmail: null,
      draftToken: null,
      admin: expect.objectContaining({ email: ADMIN.email, role: ADMIN.role, complimentary: false, idempotencyKey: KEY }),
    }));
  });

  it("a pending registration carries no waiver", async () => {
    await call({ categoryId: "c1", participants: [{ type: "solo" }], idempotencyKey: KEY, couponId: "k1" });
    const arg = mockCreate.mock.calls[0][0] as { couponId: string | null; admin: { waiverReason: string | null } };
    expect(arg.couponId).toBe("k1");
    expect(arg.admin.waiverReason).toBeNull();
  });

  it("a complimentary registration passes its trimmed reason and no coupon", async () => {
    await call({ categoryId: "c1", participants: [{ type: "solo" }], idempotencyKey: KEY, complimentary: true, waiverReason: "  Race director's guest, agreed on 21 Oct  " });
    const arg = mockCreate.mock.calls[0][0] as { couponId: string | null; admin: { complimentary: boolean; waiverReason: string } };
    expect(arg.admin.complimentary).toBe(true);
    expect(arg.admin.waiverReason).toBe("Race director's guest, agreed on 21 Oct");
    expect(arg.couponId).toBeNull();
  });
});

describe("the shared function keeps public registration unchanged", () => {
  const core = registrationSource();

  it("admin-only columns are added only for admin-created registrations", () => {
    expect(core).toMatch(/const adminColumns = source === "admin_manual" && admin \? \{/);
    expect(core).toMatch(/\.\.\.adminColumns,/);
  });

  it("a complimentary registration takes the whole price as its discount, stored as free", () => {
    expect(core).toMatch(/if \(complimentary\) \{\s*discountAmt = basePrice;/);
    expect(core).toMatch(/payment_status:\s*finalPrice === 0 \? "free" : "pending"/);
  });

  it("a retried admin request returns the registration it already made", () => {
    expect(core).toMatch(/\.eq\("idempotency_key", admin\.idempotencyKey\)/);
    expect(core).toMatch(/alreadyCreated: true/);
  });

  it("admin registrations are audited with who made them", () => {
    expect(core).toMatch(/action:\s+complimentary \? "admin_manual_registration_complimentary" : "admin_manual_registration"/);
  });
});

describe("the migration", () => {
  const migration = read("supabase/migrations/20261026000001_it_run_admin_manual_registration.sql");

  it("is additive, with the source defaulting to public", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS registration_source TEXT NOT NULL DEFAULT 'public'/);
    expect(migration).not.toMatch(/DROP COLUMN|DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("limits the source to the two values the code uses", () => {
    expect(migration).toMatch(/CHECK \(registration_source IN \('public', 'admin_manual'\)\)/);
  });

  it("makes the idempotency key unique where it is set", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS it_run_registrations_idempotency_key_uidx[\s\S]*WHERE idempotency_key IS NOT NULL/);
  });
});

describe("the admin form", () => {
  const page = read("app/it-run/admin/manual-registration/page.tsx");

  it("never sends a payment status, and never marks anything paid", () => {
    expect(page).not.toMatch(/payment_status|paid:\s*true|markPaid/);
  });

  it("sends one submission key per form and reuses it on retry", () => {
    expect(page).toMatch(/const keyRef = useRef\(newKey\(\)\)/);
    expect(page).toMatch(/idempotencyKey: keyRef\.current/);
  });

  it("applies a discount code through the same validation as the public form", () => {
    expect(page).toMatch(/fetch\("\/api\/it-run\/coupons\/validate"/);
    expect(page).toMatch(/couponId: complimentary \? null : \(coupon\?\.id \?\? null\)/);
  });

  it("a complimentary registration and a discount code are never sent together", () => {
    expect(page).toMatch(/if \(complimentary && coupon\)/);
    expect(page).toMatch(/disabled=\{!!coupon\}/);
  });

  it("lets an admin reach the form from the admin menu", () => {
    const layout = read("app/it-run/admin/layout.tsx");
    expect(layout).toMatch(/href: "\/it-run\/admin\/manual-registration"[\s\S]*?roles: \["super_admin", "event_admin"\]/);
  });
});
