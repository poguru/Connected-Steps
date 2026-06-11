process.env.ADMIN_PASSWORD      = "test-admin-password";
process.env.COACH_TOKEN_SECRET  = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/recalculate-leaderboard", () => ({ recalculateMonth: jest.fn() }));

import { POST } from "@/app/api/admin/sessions/[id]/sync/route";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;
const mockRecalculateMonth  = recalculateMonth  as jest.Mock;

const SESSION_ID    = "session-test-001";
const SESSION_MONTH = "2026-06";

function makeRequest(): NextRequest {
  return new NextRequest(
    new URL(`http://localhost/api/admin/sessions/${SESSION_ID}/sync`),
    { method: "POST", headers: { "x-admin-password": "test-admin-password" } }
  );
}

function makeParams() {
  return { params: Promise.resolve({ id: SESSION_ID }) };
}

function makeDb(unsyncedCount: number) {
  const sessionChain = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { date: `${SESSION_MONTH}-07` }, error: null }),
  };

  const countChain = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ count: unsyncedCount, error: null }).then(resolve),
  };

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "sessions")           return sessionChain;
      if (table === "session_attendance") return countChain;
      return {};
    }),
  };
}

beforeEach(() => jest.clearAllMocks());

describe("POST /api/admin/sessions/[id]/sync", () => {

  test("returns 401 without admin password", async () => {
    const req = new NextRequest(
      new URL(`http://localhost/api/admin/sessions/${SESSION_ID}/sync`),
      { method: "POST" }
    );
    const res = await POST(req, makeParams());
    expect(res.status).toBe(401);
  });

  test("returns nothing-to-sync when all records are already synced", async () => {
    mockGetSupabaseServer.mockReturnValue(makeDb(0));

    const res  = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.synced).toBe(0);
    expect(body.message).toMatch(/nothing to sync/i);
    expect(mockRecalculateMonth).not.toHaveBeenCalled();
  });

  test("calls recalculateMonth when unsynced records exist", async () => {
    mockGetSupabaseServer.mockReturnValue(makeDb(5));
    mockRecalculateMonth.mockResolvedValue({ updated: 3, message: "Recalculated 3 user(s)." });

    const res  = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRecalculateMonth).toHaveBeenCalledTimes(1);
    expect(mockRecalculateMonth).toHaveBeenCalledWith(SESSION_MONTH);
    expect(body.synced).toBe(3);
  });

  test("idempotency: second sync finds 0 unsynced records and skips recalculation", async () => {
    mockGetSupabaseServer.mockReturnValueOnce(makeDb(5));
    mockRecalculateMonth.mockResolvedValueOnce({ updated: 3, message: "Recalculated." });
    await POST(makeRequest(), makeParams());

    mockGetSupabaseServer.mockReturnValueOnce(makeDb(0));
    const res2  = await POST(makeRequest(), makeParams());
    const body2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(body2.synced).toBe(0);
    expect(mockRecalculateMonth).toHaveBeenCalledTimes(1);
  });

  test("concurrent syncs: both calls proceed and each returns the correct result", async () => {
    mockGetSupabaseServer.mockReturnValue(makeDb(5));
    mockRecalculateMonth.mockResolvedValue({ updated: 3, message: "Recalculated." });

    const [res1, res2] = await Promise.all([
      POST(makeRequest(), makeParams()),
      POST(makeRequest(), makeParams()),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockRecalculateMonth).toHaveBeenCalledTimes(2);
    const [b1, b2] = await Promise.all([res1.json(), res2.json()]);
    expect(b1.synced).toBe(3);
    expect(b2.synced).toBe(3);
  });

  test("derives the correct month from the session date", async () => {
    mockGetSupabaseServer.mockReturnValue(makeDb(2));
    mockRecalculateMonth.mockResolvedValue({ updated: 1, message: "Done." });

    await POST(makeRequest(), makeParams());

    expect(mockRecalculateMonth).toHaveBeenCalledWith("2026-06");
  });
});
