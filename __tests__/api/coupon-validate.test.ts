process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { POST }              from "@/app/api/coupons/validate/route";
import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockDb = getSupabaseServer as jest.Mock;

function ch(data: unknown, error: unknown = null): Record<string, jest.Mock> {
  const result = { data, error };
  const self: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  for (const m of ["select", "eq", "limit"]) self[m] = jest.fn().mockReturnValue(self);
  self.single      = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.maybeSingle = jest.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  self.then        = jest.fn().mockImplementation(
    (res: (v: unknown) => unknown, rej?: (v: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  );
  return self;
}

const FUTURE = new Date(Date.now() + 86400_000 * 30).toISOString();
const PAST   = new Date(Date.now() - 86400_000).toISOString();

const BASE_COUPON = {
  id: "cpn-1", code: "SAVE10", discount_type: "percentage", discount_value: 10,
  expires_at: FUTURE, use_count: 5, max_uses: 100,
  event_id: null, assigned_to_email: null,
  description: "10% off everything",
};

function makeDb(coupon: unknown, couponUses: unknown[] = []): ReturnType<typeof getSupabaseServer> {
  const counters: Record<string, number> = {};
  return {
    from: jest.fn().mockImplementation((table: string) => {
      counters[table] = (counters[table] ?? 0) + 1;
      if (table === "coupons")     return ch(coupon, coupon ? null : { code: "PGRST116" });
      if (table === "coupon_uses") return ch(couponUses);
      return ch(null);
    }),
  } as unknown as ReturnType<typeof getSupabaseServer>;
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/coupons/validate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/coupons/validate — input validation", () => {
  test("returns 400 when code is missing", async () => {
    mockDb.mockReturnValue(makeDb(null));
    const res  = await POST(makeReq({ email: "a@b.com" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/enter a coupon code/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Coupon lookup
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/coupons/validate — coupon lookup", () => {
  test("returns 404 for an unknown coupon code", async () => {
    mockDb.mockReturnValue(makeDb(null));
    const res  = await POST(makeReq({ code: "BADCODE" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/invalid coupon/i);
  });

  test("normalises code to uppercase before lookup", async () => {
    mockDb.mockReturnValue(makeDb(BASE_COUPON));
    const res  = await POST(makeReq({ code: "save10" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Validity checks
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/coupons/validate — validity checks", () => {
  test("returns 410 when coupon has expired", async () => {
    mockDb.mockReturnValue(makeDb({ ...BASE_COUPON, expires_at: PAST }));
    const res  = await POST(makeReq({ code: "SAVE10" }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  test("returns 410 when coupon has reached its usage limit", async () => {
    mockDb.mockReturnValue(makeDb({ ...BASE_COUPON, use_count: 100, max_uses: 100 }));
    const res  = await POST(makeReq({ code: "SAVE10" }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/usage limit/i);
  });

  test("returns 400 when coupon is restricted to a different event", async () => {
    mockDb.mockReturnValue(makeDb({ ...BASE_COUPON, event_id: "event-A" }));
    const res  = await POST(makeReq({ code: "SAVE10", event_id: "event-B" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not valid for this event/i);
  });

  test("allows coupon when event_id matches restriction", async () => {
    mockDb.mockReturnValue(makeDb({ ...BASE_COUPON, event_id: "event-A" }));
    const res  = await POST(makeReq({ code: "SAVE10", event_id: "event-A" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  test("returns 403 when coupon is assigned to a different email", async () => {
    mockDb.mockReturnValue(makeDb({ ...BASE_COUPON, assigned_to_email: "other@test.com" }));
    const res  = await POST(makeReq({ code: "SAVE10", email: "user@test.com" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not assigned to your account/i);
  });

  test("allows coupon when email matches assigned_to_email", async () => {
    mockDb.mockReturnValue(makeDb({ ...BASE_COUPON, assigned_to_email: "user@test.com" }));
    const res  = await POST(makeReq({ code: "SAVE10", email: "user@test.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  test("allows coupon when no email restriction is set", async () => {
    mockDb.mockReturnValue(makeDb(BASE_COUPON));
    const res  = await POST(makeReq({ code: "SAVE10", email: "anyone@test.com" }));
    expect(res.status).toBe(200);
  });

  test("returns 409 when user has already used this coupon", async () => {
    mockDb.mockReturnValue(makeDb(BASE_COUPON, [{ id: "use-1" }]));
    const res  = await POST(makeReq({ code: "SAVE10", email: "user@test.com" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already used/i);
  });

  test("skips per-user check when no email is provided", async () => {
    // Without email, the coupon_uses table is not queried
    mockDb.mockReturnValue(makeDb(BASE_COUPON, [{ id: "use-1" }]));
    const res  = await POST(makeReq({ code: "SAVE10" }));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Valid response shape
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/coupons/validate — response shape", () => {
  test("returns coupon details on successful validation", async () => {
    mockDb.mockReturnValue(makeDb(BASE_COUPON));
    const res  = await POST(makeReq({ code: "SAVE10" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.coupon_id).toBe("cpn-1");
    expect(body.discount_type).toBe("percentage");
    expect(body.discount_value).toBe(10);
    expect(body.description).toBe("10% off everything");
  });

  test("coupon with no expiry date is accepted", async () => {
    mockDb.mockReturnValue(makeDb({ ...BASE_COUPON, expires_at: null }));
    const res  = await POST(makeReq({ code: "SAVE10" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });
});
