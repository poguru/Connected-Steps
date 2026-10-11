/**
 * An admin edit to a participant's contact details follows the registration rules: a valid mobile, an emergency
 * contact that is not the mobile, and a real date of birth that is not in the future. A refused edit writes nothing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/it-run-auth", () => ({
  requireRole: jest.fn(),
  getClientIp: () => "203.0.113.20",
}));

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { PATCH } from "@/app/api/it-run/admin/participants/route";

const CURRENT = {
  id: "p-1", first_name: "Asha", last_name: "Rao", participant_type: "adult",
  mobile: "9876543210", emergency_phone: "9123456789", dob: "1990-05-10",
};

function fakeDb() {
  const updates: any[] = [];
  return {
    updates,
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.single = () => Promise.resolve({ data: { ...CURRENT }, error: null });
      b.update = (p: any) => { if (table === "it_run_participants") updates.push(p); return b; };
      b.insert = () => Promise.resolve({ data: null, error: null });
      b.then = (res: any, rej?: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return b;
    },
  };
}

function patch(body: Record<string, unknown>) {
  return PATCH(new NextRequest("http://t/api/it-run/admin/participants", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "p-1", ...body }),
  }));
}

let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue({ email: "admin@example.com", role: "event_admin" });
  db = fakeDb();
  (getSupabaseServer as jest.Mock).mockReturnValue(db);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("PATCH /api/it-run/admin/participants: contact rules", () => {
  it("stores a valid mobile written with +91, normalized to 10 digits", async () => {
    const res = await patch({ mobile: "+91 98765 43211" });
    expect(res.status).toBe(200);
    expect(db.updates[0].mobile).toBe("9876543211");
  });

  it("refuses an invalid mobile and writes nothing", async () => {
    const res = await patch({ mobile: "98765" });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("mobile");
    expect(db.updates).toEqual([]);
  });

  it("refuses an emergency contact that matches the current mobile", async () => {
    const res = await patch({ emergency_phone: "+91 98765 43210" });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("emergency_phone");
    expect(db.updates).toEqual([]);
  });

  it("refuses a mobile edit that would match the stored emergency contact", async () => {
    const res = await patch({ mobile: "9123456789" });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("emergency_phone");
    expect(db.updates).toEqual([]);
  });

  it("accepts an emergency contact that differs from the mobile", async () => {
    const res = await patch({ emergency_phone: "9000011111" });
    expect(res.status).toBe(200);
  });

  it("refuses a future date of birth and writes nothing", async () => {
    const res = await patch({ dob: "2999-01-01" });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("dob");
    expect(db.updates).toEqual([]);
  });

  it("refuses an impossible date of birth", async () => {
    const res = await patch({ dob: "1990-02-31" });
    expect(res.status).toBe(400);
    expect(db.updates).toEqual([]);
  });

  it("accepts a valid past date of birth", async () => {
    const res = await patch({ dob: "1988-03-15" });
    expect(res.status).toBe(200);
  });
});
