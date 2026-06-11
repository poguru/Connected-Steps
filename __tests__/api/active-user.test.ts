process.env.COACH_TOKEN_SECRET = "test-secret";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: jest.fn(),
}));

import { requireActiveUser } from "@/lib/active-user";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

function makeDbMock(userData: { is_active: boolean } | null) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.select      = jest.fn().mockReturnValue(chain);
  chain.eq          = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: userData, error: null });
  return { from: jest.fn().mockReturnValue(chain) };
}

beforeEach(() => jest.clearAllMocks());

describe("requireActiveUser", () => {
  test("active user — returns null (proceed)", async () => {
    mockGetSupabaseServer.mockReturnValue(makeDbMock({ is_active: true }));

    const result = await requireActiveUser("runner@example.com");

    expect(result).toBeNull();
  });

  test("deactivated user — returns 403 response", async () => {
    mockGetSupabaseServer.mockReturnValue(makeDbMock({ is_active: false }));

    const result = await requireActiveUser("banned@example.com");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json();
    expect(body.error).toBeTruthy();
  });

  test("missing user (no DB row) — returns null (proceed)", async () => {
    mockGetSupabaseServer.mockReturnValue(makeDbMock(null));

    const result = await requireActiveUser("ghost@example.com");

    expect(result).toBeNull();
  });

  test("normalises email to lowercase before querying", async () => {
    const db = makeDbMock({ is_active: true });
    mockGetSupabaseServer.mockReturnValue(db);

    await requireActiveUser("RUNNER@EXAMPLE.COM");

    const fromChain = db.from.mock.results[0].value;
    expect(fromChain.eq).toHaveBeenCalledWith("email", "runner@example.com");
  });
});
