process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.COACH_TOKEN_SECRET = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: jest.fn(),
}));

import { DELETE } from "@/app/api/admin/sessions/[id]/route";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

const SESSION_ID = "session-abc-123";

function makeRequest(): NextRequest {
  return new NextRequest(
    new URL(`http://localhost/api/admin/sessions/${SESSION_ID}`),
    { headers: { "x-admin-password": "test-admin-password" } }
  );
}

function makeParams() {
  return { params: Promise.resolve({ id: SESSION_ID }) };
}

// Builds a mock Supabase client where each table call returns the given result.
// tableResults maps table name → { error } for delete operations.
function makeDbMock(tableResults: Record<string, { error: { message: string } | null }>) {
  const buildChain = (tableName: string) => {
    const result = tableResults[tableName] ?? { error: null };
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.delete = jest.fn().mockReturnValue(chain);
    chain.eq     = jest.fn().mockReturnValue(chain);
    // Final awaited value
    chain.then   = jest.fn().mockImplementation((resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve));
    Object.defineProperty(chain, Symbol.toStringTag, { value: "Promise" });
    // Make the chain itself thenable so `await db.from(...).delete().eq(...)` resolves
    chain[Symbol.iterator as unknown as string] = undefined;
    return chain;
  };

  const chains: Record<string, ReturnType<typeof buildChain>> = {};
  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (!chains[table]) chains[table] = buildChain(table);
      return chains[table];
    }),
    _chains: chains,
  };
}

// Simpler mock approach: track call order and return configured values per call
function makeSequentialMock(calls: Array<{ error: { message: string } | null }>) {
  let callIndex = 0;

  const buildChain = () => {
    const index = callIndex++;
    const result = calls[index] ?? { error: null };
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.delete = jest.fn().mockReturnValue(chain);
    chain.eq     = jest.fn().mockReturnValue(chain);
    // When awaited, return the configured result
    (chain as unknown as Promise<unknown>)[Symbol.toStringTag as unknown as string] = "MockChain";
    Object.assign(chain, {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    });
    return chain;
  };

  return {
    from: jest.fn().mockImplementation(() => buildChain()),
  };
}

beforeEach(() => jest.clearAllMocks());

describe("DELETE /api/admin/sessions/[id] — notification cleanup", () => {

  test("deletes join notifications before deleting session", async () => {
    // We verify that db.from('notifications') is called before db.from('sessions')
    const callOrder: string[] = [];

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        callOrder.push(table);
        const chain = {
          delete:      jest.fn().mockReturnThis(),
          eq:          jest.fn().mockReturnThis(),
          then:        (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
        return chain;
      }),
    };
    mockGetSupabaseServer.mockReturnValue(db);

    await DELETE(makeRequest(), makeParams());

    // notifications must be cleaned up before the session row is deleted
    const notifIdx   = callOrder.indexOf("notifications");
    const sessionsIdx = callOrder.lastIndexOf("sessions");
    expect(notifIdx).toBeGreaterThanOrEqual(0);
    expect(notifIdx).toBeLessThan(sessionsIdx);
  });

  test("cleanup filters on /join/[id] action_url", async () => {
    let notifEqArgs: unknown[] = [];

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        const chain = {
          delete:      jest.fn().mockReturnThis(),
          eq:          jest.fn().mockImplementation((...args: unknown[]) => {
            if (table === "notifications") notifEqArgs = args;
            return chain;
          }),
          then:        (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
        return chain;
      }),
    };
    mockGetSupabaseServer.mockReturnValue(db);

    await DELETE(makeRequest(), makeParams());

    expect(notifEqArgs).toEqual(["action_url", `/join/${SESSION_ID}`]);
  });

  test("session is deleted even when notification cleanup fails", async () => {
    const deletedTables: string[] = [];

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        const chain = {
          delete: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockReturnThis(),
          then:   (resolve: (v: unknown) => unknown) => {
            // notifications cleanup returns an error; all others succeed
            const result = table === "notifications"
              ? { error: { message: "cleanup DB error" } }
              : { error: null };
            if (table !== "notifications") deletedTables.push(table);
            return Promise.resolve(result).then(resolve);
          },
        };
        return chain;
      }),
    };
    mockGetSupabaseServer.mockReturnValue(db);

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res  = await DELETE(makeRequest(), makeParams());
    const body = await res.json();
    consoleSpy.mockRestore();

    // Session deletion still succeeded
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The session and attendance tables were still touched
    expect(deletedTables).toContain("sessions");
  });

  test("cleanup failure is logged", async () => {
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        const chain = {
          delete: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockReturnThis(),
          then:   (resolve: (v: unknown) => unknown) => {
            const result = table === "notifications"
              ? { error: { message: "db timeout" } }
              : { error: null };
            return Promise.resolve(result).then(resolve);
          },
        };
        return chain;
      }),
    };
    mockGetSupabaseServer.mockReturnValue(db);

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await DELETE(makeRequest(), makeParams());

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[session-delete]`),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });
});
