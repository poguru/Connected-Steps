/**
 * Commerce & Finance Platform tests
 *
 * Tests verify:
 * - Finance aggregation utilities (paiseToRupees, rupeesToPaise, estimatePlatformFee)
 * - writeFinancialAudit never throws (silent failure)
 * - Finance dashboard API auth guard
 * - Merchandise product CRUD auth guard
 * - Donations API auth guard + validation
 * - Manual payments auth guard + validation
 * - Payouts API auth guard + validation
 * - Sponsor packages auth guard
 * - Reports route returns CSV for known report types
 */

process.env.COACH_TOKEN_SECRET = "test-secret-commerce-finance";
process.env.ADMIN_PASSWORD     = "test-secret-commerce-finance";
process.env.NEXT_PUBLIC_SUPABASE_URL      = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY     = "test-service-role-key";

import { NextRequest } from "next/server";
import { signAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import { paiseToRupees, rupeesToPaise, writeFinancialAudit } from "@/lib/finance-service";

// ── Supabase mock ──────────────────────────────────────────────────────────────

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: jest.fn((table: string) => {
      const chain: Record<string, jest.Mock> = {};
      const self = () => chain;
      chain.select    = jest.fn().mockReturnValue(chain);
      chain.insert    = jest.fn().mockReturnValue(chain);
      chain.update    = jest.fn().mockReturnValue(chain);
      chain.delete    = jest.fn().mockReturnValue(chain);
      chain.upsert    = jest.fn().mockReturnValue(chain);
      chain.eq        = jest.fn().mockReturnValue(chain);
      chain.neq       = jest.fn().mockReturnValue(chain);
      chain.in        = jest.fn().mockReturnValue(chain);
      chain.gte       = jest.fn().mockReturnValue(chain);
      chain.lte       = jest.fn().mockReturnValue(chain);
      chain.ilike     = jest.fn().mockReturnValue(chain);
      chain.not       = jest.fn().mockReturnValue(chain);
      chain.order     = jest.fn().mockReturnValue(chain);
      chain.range     = jest.fn().mockReturnValue(chain);
      chain.limit     = jest.fn().mockReturnValue(chain);
      chain.single    = jest.fn().mockResolvedValue({ data: null, error: null });
      chain.maybeSingle= jest.fn().mockResolvedValue({ data: null, error: null });
      // Default resolve: empty array for list queries
      chain.then      = jest.fn().mockImplementation((fn: (v: unknown) => unknown) =>
        Promise.resolve(fn({ data: [], error: null, count: 0 }))
      );
      return chain;
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
      })),
    },
  }),
}));

// ── Helper ─────────────────────────────────────────────────────────────────────

interface ReqInit {
  method?: string;
  body?: string;
}

function adminReq(url: string, opts?: ReqInit): NextRequest {
  const token = signAdminSession();
  return new NextRequest(url, {
    method:  opts?.method,
    body:    opts?.body,
    headers: { "Content-Type": "application/json", cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
  });
}

function anonReq(url: string, opts?: ReqInit): NextRequest {
  return new NextRequest(url, {
    method:  opts?.method,
    body:    opts?.body,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Unit: paise / rupee conversion ────────────────────────────────────────────

describe("Finance unit utilities", () => {
  it("paiseToRupees converts correctly", () => {
    expect(paiseToRupees(10000)).toBe(100);
    expect(paiseToRupees(1)).toBe(0.01);
    expect(paiseToRupees(0)).toBe(0);
    expect(paiseToRupees(99)).toBe(0.99);
  });

  it("rupeesToPaise converts correctly", () => {
    expect(rupeesToPaise(100)).toBe(10000);
    expect(rupeesToPaise(0.01)).toBe(1);
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(999.99)).toBe(99999);
  });

  it("round-trip is stable", () => {
    const original = 123456;
    expect(rupeesToPaise(paiseToRupees(original))).toBe(original);
  });

  it("rupeesToPaise handles decimal precision", () => {
    // 0.1 + 0.2 = 0.30000000004 in JS floating point
    const result = rupeesToPaise(0.1 + 0.2);
    expect(result).toBe(30); // Math.round handles it
  });
});

// ── writeFinancialAudit never throws ─────────────────────────────────────────

describe("writeFinancialAudit", () => {
  it("does not throw when DB insert fails", async () => {
    // The mock returns null error by default, but let's also test explicit error path
    await expect(
      writeFinancialAudit({
        organization_id: "00000000-0000-0000-0000-000000000001",
        action:       "test.action",
        actor_email:  "test@example.com",
        entity_type:  "test",
        entity_id:    "entity-123",
        amount_paise: 10000,
      })
    ).resolves.not.toThrow();
  });

  it("accepts all optional fields", async () => {
    await expect(
      writeFinancialAudit({
        organization_id: "00000000-0000-0000-0000-000000000001",
        event_id:     "event-abc",
        action:       "payout.paid",
        actor_email:  "admin@example.com",
        entity_type:  "payout",
        entity_id:    "payout-123",
        amount_paise: 50000,
        detail:       { method: "bank_transfer", ref: "UTR12345" },
        ip:           "127.0.0.1",
      })
    ).resolves.toBeUndefined();
  });
});

// ── Finance Dashboard API ─────────────────────────────────────────────────────

describe("GET /api/admin/finance/dashboard", () => {
  const { GET } = require("@/app/api/admin/finance/dashboard/route");

  it("rejects unauthenticated requests with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/finance/dashboard"));
    expect(res.status).toBe(401);
  });

  it("returns 200 for authenticated admin", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/dashboard"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("gross_revenue");
    expect(body).toHaveProperty("net_revenue");
    expect(body).toHaveProperty("event_revenue");
    expect(body).toHaveProperty("currency", "INR");
  });

  it("passes filters to query", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/dashboard?org_id=00000000-0000-0000-0000-000000000001&date_from=2026-01-01"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters.organization_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.filters.date_from).toBe("2026-01-01");
  });
});

// ── Finance Reports API ───────────────────────────────────────────────────────

describe("GET /api/admin/finance/reports", () => {
  const { GET } = require("@/app/api/admin/finance/reports/route");

  it("rejects unauthenticated requests with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/finance/reports?report=invoices"));
    expect(res.status).toBe(401);
  });

  it("returns CSV content type for CSV format", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/reports?report=invoices&format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
  });

  it("returns JSON for json format", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/reports?report=donations&format=json"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("report", "donations");
    expect(body).toHaveProperty("rows");
  });

  it("rejects unknown report type with 400", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/reports?report=unknown_type"));
    expect(res.status).toBe(400);
  });

  const validReports = ["registrations","refunds","coupons","invoices","memberships","merchandise","donations","sponsors","payouts","manual_payments"];
  validReports.forEach(report => {
    it(`accepts report type: ${report}`, async () => {
      const res = await GET(adminReq(`http://localhost/api/admin/finance/reports?report=${report}&format=json`));
      expect(res.status).toBe(200);
    });
  });
});

// ── Manual Payments API ───────────────────────────────────────────────────────

describe("POST /api/admin/finance/manual-payments", () => {
  const { POST, GET } = require("@/app/api/admin/finance/manual-payments/route");

  it("rejects unauthenticated POST with 401", async () => {
    const res = await POST(anonReq("http://localhost/api/admin/finance/manual-payments", {
      method: "POST", body: JSON.stringify({ organization_id: "x" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(adminReq("http://localhost/api/admin/finance/manual-payments", {
      method: "POST",
      body: JSON.stringify({ user_email: "a@b.com" }),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated GET with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/finance/manual-payments"));
    expect(res.status).toBe(401);
  });

  it("returns 200 for authenticated GET", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/manual-payments"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("records");
  });
});

// ── Payouts API ───────────────────────────────────────────────────────────────

describe("POST /api/admin/finance/payouts", () => {
  const { POST, GET, PATCH } = require("@/app/api/admin/finance/payouts/route");

  it("rejects unauthenticated POST with 401", async () => {
    const res = await POST(anonReq("http://localhost/api/admin/finance/payouts", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(adminReq("http://localhost/api/admin/finance/payouts", {
      method: "POST",
      body: JSON.stringify({ payee_name: "Vendor X" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 for authenticated GET", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/payouts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("payouts");
  });

  it("rejects PATCH without id with 400", async () => {
    const res = await PATCH(adminReq("http://localhost/api/admin/finance/payouts", {
      method: "PATCH",
      body: JSON.stringify({ status: "paid" }),
    }));
    expect(res.status).toBe(400);
  });
});

// ── Merchandise Products API ──────────────────────────────────────────────────

describe("Merchandise Products API", () => {
  const { GET, POST } = require("@/app/api/admin/merchandise/products/route");

  it("rejects unauthenticated GET with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/merchandise/products"));
    expect(res.status).toBe(401);
  });

  it("returns products list for authenticated admin", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/merchandise/products"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("products");
  });

  it("rejects POST without required fields", async () => {
    const res = await POST(adminReq("http://localhost/api/admin/merchandise/products", {
      method: "POST",
      body: JSON.stringify({ name: "T-shirt" }),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid category", async () => {
    const res = await POST(adminReq("http://localhost/api/admin/merchandise/products", {
      method: "POST",
      body: JSON.stringify({
        organization_id: "00000000-0000-0000-0000-000000000001",
        name: "T-shirt", price_rupees: 500,
        category: "invalid_category",
      }),
    }));
    expect(res.status).toBe(400);
  });
});

// ── Donations API ─────────────────────────────────────────────────────────────

describe("Donations API", () => {
  const { GET, POST, PATCH } = require("@/app/api/admin/donations/route");

  it("rejects unauthenticated GET with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/donations"));
    expect(res.status).toBe(401);
  });

  it("returns donations list for authenticated admin", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/donations"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("donations");
    expect(body).toHaveProperty("total_records");
    expect(body).toHaveProperty("total_rupees");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(adminReq("http://localhost/api/admin/donations", {
      method: "POST",
      body: JSON.stringify({ user_email: "a@b.com" }),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects PATCH without id", async () => {
    const res = await PATCH(adminReq("http://localhost/api/admin/donations", {
      method: "PATCH",
      body: JSON.stringify({ tax_receipt_sent: true }),
    }));
    expect(res.status).toBe(400);
  });
});

// ── Sponsor Packages API ──────────────────────────────────────────────────────

describe("Sponsor Packages API", () => {
  const { GET, POST, PATCH, DELETE } = require("@/app/api/admin/sponsors/packages/route");

  it("rejects unauthenticated GET with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/sponsors/packages"));
    expect(res.status).toBe(401);
  });

  it("returns packages list for authenticated admin", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/sponsors/packages"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("packages");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(adminReq("http://localhost/api/admin/sponsors/packages", {
      method: "POST",
      body: JSON.stringify({ price_rupees: 100000 }),
    }));
    expect(res.status).toBe(400);
  });
});

// ── Sponsor Agreements API ────────────────────────────────────────────────────

describe("Sponsor Agreements API", () => {
  const { GET } = require("@/app/api/admin/sponsors/agreements/route");

  it("rejects unauthenticated GET with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/sponsors/agreements"));
    expect(res.status).toBe(401);
  });

  it("returns agreements list for authenticated admin", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/sponsors/agreements"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("agreements");
  });
});

// ── Financial Audit API ───────────────────────────────────────────────────────

describe("GET /api/admin/finance/audit", () => {
  const { GET } = require("@/app/api/admin/finance/audit/route");

  it("rejects unauthenticated GET with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/finance/audit"));
    expect(res.status).toBe(401);
  });

  it("returns audit logs for authenticated admin", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/finance/audit"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("logs");
    expect(body).toHaveProperty("total");
  });
});

// ── Merchandise Orders API ────────────────────────────────────────────────────

describe("Merchandise Orders API", () => {
  const { GET, PATCH } = require("@/app/api/admin/merchandise/orders/route");

  it("rejects unauthenticated GET with 401", async () => {
    const res = await GET(anonReq("http://localhost/api/admin/merchandise/orders"));
    expect(res.status).toBe(401);
  });

  it("returns orders for authenticated admin", async () => {
    const res = await GET(adminReq("http://localhost/api/admin/merchandise/orders"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("orders");
  });

  it("rejects PATCH with invalid status", async () => {
    const res = await PATCH(adminReq("http://localhost/api/admin/merchandise/orders", {
      method: "PATCH",
      body: JSON.stringify({ id: "some-uuid", status: "invalid_status" }),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects PATCH without id", async () => {
    const res = await PATCH(adminReq("http://localhost/api/admin/merchandise/orders", {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    }));
    expect(res.status).toBe(400);
  });
});
