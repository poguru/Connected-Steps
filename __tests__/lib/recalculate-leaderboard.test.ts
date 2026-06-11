process.env.COACH_TOKEN_SECRET       = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { recalculateMonth } from "@/lib/recalculate-leaderboard";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

// ── DB mock factory ───────────────────────────────────────────────────────────

interface AttRow {
  id:           number;
  session_id:   string;
  user_email:   string;
  attended:     boolean;
  bonus_points: number;
}
interface UserRow {
  email:      string;
  first_name: string;
  last_name:  string;
  location:   string;
  goal:       string;
}
interface LbRow {
  user_email:      string;
  month_points:    number;
  total_points:    number;
  points_month:    string;
  month_runs?:     number;
  month_km?:       number;
  month_time_secs?: number;
  total_runs?:     number;
  total_km?:       number;
  total_time_secs?: number;
}

function makeDb(opts: {
  sessions:             { id: string; date: string; location: string }[];
  attendance:           AttRow[];
  users:                UserRow[];
  existingLeaderboard?: LbRow[];
}) {
  const upsertMock = jest.fn().mockResolvedValue({ error: null });
  const attUpdateInMock = jest.fn().mockResolvedValue({ error: null });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "sessions") {
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.gte    = jest.fn().mockReturnValue(chain);
        chain.lte    = jest.fn().mockReturnValue(chain);
        chain.order  = jest.fn().mockResolvedValue({ data: opts.sessions, error: null });
        return chain;
      }

      if (table === "session_attendance") {
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.in     = jest.fn().mockResolvedValue({ data: opts.attendance, error: null });
        chain.update = jest.fn().mockReturnValue({ in: attUpdateInMock });
        return chain;
      }

      if (table === "users") {
        const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        chain.select = jest.fn().mockReturnValue(chain);
        chain.in     = jest.fn().mockResolvedValue({ data: opts.users, error: null });
        return chain;
      }

      if (table === "leaderboard") {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: opts.existingLeaderboard ?? [], error: null }),
          }),
          upsert: upsertMock,
        };
      }

      return {};
    }),
    _upsertMock:       upsertMock,
    _attUpdateInMock:  attUpdateInMock,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSIONS = [{ id: "s1", date: "2026-06-07", location: "Hyd" }];
const USERS    = [
  { email: "a@x.com", first_name: "Alice", last_name: "A", location: "Hyd", goal: "5k"  },
  { email: "b@x.com", first_name: "Bob",   last_name: "B", location: "Hyd", goal: "10k" },
];

beforeEach(() => jest.clearAllMocks());

describe("recalculateMonth", () => {

  test("single batch upsert replaces N sequential updates", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [
        { id: 1, session_id: "s1", user_email: "a@x.com", attended: true,  bonus_points: 0 },
        { id: 2, session_id: "s1", user_email: "b@x.com", attended: true,  bonus_points: 0 },
      ],
      users: USERS,
    });
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await recalculateMonth("2026-06");

    expect(result.updated).toBe(2);
    // One upsert call for both users — not two separate update calls
    expect(db._upsertMock).toHaveBeenCalledTimes(1);
    const rows = db._upsertMock.mock.calls[0][0] as { user_email: string }[];
    expect(rows).toHaveLength(2);
  });

  test("base score: 5 pts per attended session + bonus_points", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [
        { id: 1, session_id: "s1", user_email: "a@x.com", attended: true,  bonus_points: 3 },
        { id: 2, session_id: "s1", user_email: "b@x.com", attended: false, bonus_points: 0 },
      ],
      users: USERS,
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    const rows = db._upsertMock.mock.calls[0][0] as { user_email: string; month_points: number }[];
    const alice = rows.find(r => r.user_email === "a@x.com");
    const bob   = rows.find(r => r.user_email === "b@x.com");
    expect(alice?.month_points).toBe(8);  // 5 base + 3 bonus
    expect(bob?.month_points).toBe(0);    // attended = false
  });

  test("total_points accumulates correctly across months", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
      users:      [USERS[0]],
      existingLeaderboard: [{
        user_email:   "a@x.com",
        month_points: 10,        // previous June points (to be replaced)
        total_points: 60,        // includes all-time
        points_month: "2026-06",
        month_runs:   5, month_km: 25, month_time_secs: 7200,
        total_runs:   20, total_km: 100, total_time_secs: 28800,
      }],
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    const rows = db._upsertMock.mock.calls[0][0] as { user_email: string; month_points: number; total_points: number }[];
    const alice = rows.find(r => r.user_email === "a@x.com")!;
    expect(alice.month_points).toBe(5);               // 1 session × 5 pts
    expect(alice.total_points).toBe(60 - 10 + 5);    // old_total - old_month + new_month = 55
  });

  test("preserves run/km data on update — does not zero it out", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
      users:      [USERS[0]],
      existingLeaderboard: [{
        user_email:      "a@x.com",
        month_points:    0, total_points: 50, points_month: "2026-05",
        month_runs:      12, month_km: 60, month_time_secs: 18000,
        total_runs:      40, total_km: 200, total_time_secs: 72000,
      }],
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    const rows = db._upsertMock.mock.calls[0][0] as {
      user_email: string; total_runs: number; total_km: number;
    }[];
    const alice = rows.find(r => r.user_email === "a@x.com")!;
    expect(alice.total_runs).toBe(40);
    expect(alice.total_km).toBe(200);
  });

  test("marks all month attendance as synced in a single batch call", async () => {
    const db = makeDb({
      sessions:   SESSIONS,
      attendance: [
        { id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 },
        { id: 2, session_id: "s1", user_email: "b@x.com", attended: true, bonus_points: 0 },
      ],
      users: USERS,
    });
    mockGetSupabaseServer.mockReturnValue(db);

    await recalculateMonth("2026-06");

    // One batch update call (not two per-user calls)
    expect(db._attUpdateInMock).toHaveBeenCalledTimes(1);
    expect(db._attUpdateInMock).toHaveBeenCalledWith("id", [1, 2]);
  });

  test("idempotent: same inputs produce the same upsert payload on repeated calls", async () => {
    const data = {
      sessions:   SESSIONS,
      attendance: [{ id: 1, session_id: "s1", user_email: "a@x.com", attended: true, bonus_points: 0 }],
      users:      [USERS[0]],
    };

    const db1 = makeDb(data);
    const db2 = makeDb(data);
    mockGetSupabaseServer
      .mockReturnValueOnce(db1)
      .mockReturnValueOnce(db2);

    await recalculateMonth("2026-06");
    await recalculateMonth("2026-06");

    const rows1 = db1._upsertMock.mock.calls[0][0] as { month_points: number }[];
    const rows2 = db2._upsertMock.mock.calls[0][0] as { month_points: number }[];
    expect(rows1[0].month_points).toBe(rows2[0].month_points);
  });

  test("returns early when no sessions exist in the month", async () => {
    const db = makeDb({ sessions: [], attendance: [], users: [] });
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await recalculateMonth("2026-06");

    expect(result.updated).toBe(0);
    expect(db._upsertMock).not.toHaveBeenCalled();
  });
});
