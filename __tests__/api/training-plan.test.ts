// Must set env vars before any module imports so admin-auth doesn't throw
process.env.COACH_TOKEN_SECRET = "test-secret";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: jest.fn(),
}));

jest.mock("@/lib/admin-auth", () => ({
  verifyUserToken: jest.fn(),
  isAdminOrCoach: jest.fn(),
  signUserToken: jest.fn(),
  signCoachToken: jest.fn(),
  verifyCoachToken: jest.fn(),
  COOKIE_NAME: "cs_coach_session",
}));

import { GET } from "@/app/api/user/training-plan/route";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, isAdminOrCoach } from "@/lib/admin-auth";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;
const mockVerifyUserToken = verifyUserToken as jest.Mock;
const mockIsAdminOrCoach = isAdminOrCoach as jest.Mock;

const USER_EMAIL = "runner@example.com";
const MOCK_PLAN = {
  id: 1,
  title: "Week 1",
  coach_name: "Coach Test",
  days: Array(7).fill({ type: "Run", detail: "5km", emoji: "🏃" }),
  created_at: "2026-01-01T00:00:00Z",
};

function makeRequest(email: string): NextRequest {
  return new NextRequest(
    new URL(`http://localhost/api/user/training-plan?email=${encodeURIComponent(email)}`)
  );
}

function makeDbMock(membershipRow: object | null, planRow: object | null) {
  const buildChain = (finalData: object | null) => {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    const self = () => chain;
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.order = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.single = jest.fn().mockResolvedValue({ data: finalData, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: finalData, error: null });
    void self; // satisfy TS
    return chain;
  };

  const membershipChain = buildChain(membershipRow);
  const planChain = buildChain(planRow);

  return {
    from: jest.fn().mockImplementation((table: string) =>
      table === "memberships" ? membershipChain : planChain
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Simulate the user owning the request (token email matches query email)
  mockVerifyUserToken.mockReturnValue(USER_EMAIL);
  mockIsAdminOrCoach.mockResolvedValue(false);
});

describe("GET /api/user/training-plan — membership enforcement", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const past   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  test("active membership — returns the plan", async () => {
    mockGetSupabaseServer.mockReturnValue(
      makeDbMock({ status: "active", expires_at: future }, MOCK_PLAN)
    );

    const res  = await GET(makeRequest(USER_EMAIL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).not.toBeNull();
    expect(body.plan.id).toBe(1);
  });

  test("expired membership — returns plan: null", async () => {
    mockGetSupabaseServer.mockReturnValue(
      makeDbMock({ status: "active", expires_at: past }, MOCK_PLAN)
    );

    const res  = await GET(makeRequest(USER_EMAIL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBeNull();
  });

  test("inactive membership — returns plan: null", async () => {
    mockGetSupabaseServer.mockReturnValue(
      makeDbMock({ status: "inactive", expires_at: future }, MOCK_PLAN)
    );

    const res  = await GET(makeRequest(USER_EMAIL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBeNull();
  });

  test("missing membership — returns plan: null", async () => {
    mockGetSupabaseServer.mockReturnValue(
      makeDbMock(null, MOCK_PLAN)
    );

    const res  = await GET(makeRequest(USER_EMAIL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBeNull();
  });

  test("admin/coach bypasses membership check", async () => {
    // isOwner is false (different email), isAdminOrCoach is true
    mockVerifyUserToken.mockReturnValue("coach@example.com");
    mockIsAdminOrCoach.mockResolvedValue(true);
    mockGetSupabaseServer.mockReturnValue(
      makeDbMock({ status: "inactive", expires_at: past }, MOCK_PLAN)
    );

    const res  = await GET(makeRequest(USER_EMAIL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).not.toBeNull();
  });
});
