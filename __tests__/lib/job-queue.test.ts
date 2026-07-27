// Tests for lib/job-queue.ts
//
// Covers: enqueueJob (insert, dedup, error), completeJob, failJob
// (backoff, dead-letter, error truncation), claimNextJobs (RPC, empty, error).

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));

import { getSupabaseServer }                      from "@/lib/supabase-server";
import { enqueueJob, completeJob, failJob,
         claimNextJobs }                          from "@/lib/job-queue";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ── DB mock helpers ───────────────────────────────────────────────────────────

/** Build a mock Supabase client for enqueueJob. */
function makeInsertDb(result: { data: { id: string } | null; error: { message: string; code?: string } | null }) {
  return {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

/** Build a mock Supabase client for completeJob / failJob. */
function makeUpdateDb() {
  const eqMock = jest.fn().mockResolvedValue({ error: null });
  const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
  return {
    from: jest.fn().mockReturnValue({ update: updateMock }),
    _update: updateMock,
    _eq:     eqMock,
  };
}

/** Build a mock Supabase client for claimNextJobs. */
function makeRpcDb(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: jest.fn().mockResolvedValue(result) };
}

// ── enqueueJob ────────────────────────────────────────────────────────────────

describe("enqueueJob", () => {
  test("inserts the job and returns the new id", async () => {
    mockGetSupabaseServer.mockReturnValue(
      makeInsertDb({ data: { id: "job-abc-123" }, error: null }),
    );

    const id = await enqueueJob("invoice_generate", {
      productType:     "membership",
      userEmail:       "alice@cs.test",
      userName:        "Alice",
      productName:     "Monthly Membership",
      totalPaidRupees: 999,
    });

    expect(id).toBe("job-abc-123");
  });

  test("passes correct job_type and payload to insert", async () => {
    const db = makeInsertDb({ data: { id: "x" }, error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    await enqueueJob("referral_reward", {
      referralCode:      "ABC1234",
      referredEmail:     "bob@cs.test",
      referredFirstName: "Bob",
    }, { idempotencyKey: "referral_reward:bob@cs.test" });

    const insertArg = (db.from as jest.Mock).mock.results[0].value.insert.mock.calls[0][0];
    expect(insertArg.job_type).toBe("referral_reward");
    expect(insertArg.payload.referralCode).toBe("ABC1234");
    expect(insertArg.idempotency_key).toBe("referral_reward:bob@cs.test");
  });

  test("applies priority and maxAttempts from options", async () => {
    const db = makeInsertDb({ data: { id: "y" }, error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    await enqueueJob("event_qr_email", {
      registrationId: "reg-1", registrationCode: "REG123",
      eventId: "ev-1", userEmail: "c@cs.test", userName: "Carol",
      eventTitle: "5K Run", startDate: "2026-07-01", startTime: null,
      location: "Hyderabad", distanceCategory: null,
    }, { priority: 10, maxAttempts: 5 });

    const insertArg = (db.from as jest.Mock).mock.results[0].value.insert.mock.calls[0][0];
    expect(insertArg.priority).toBe(10);
    expect(insertArg.max_attempts).toBe(5);
  });

  test("schedules run_after in the future when delaySeconds is set", async () => {
    const db = makeInsertDb({ data: { id: "z" }, error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const before = Date.now();
    await enqueueJob("membership_email", {
      userEmail: "d@cs.test", userName: "Dave",
      planLabel: "Monthly", amountINR: 999,
      expiresAt: "2026-08-01T00:00:00Z", paymentId: "pay_1",
    }, { delaySeconds: 60 });

    const insertArg = (db.from as jest.Mock).mock.results[0].value.insert.mock.calls[0][0];
    const runAfterMs = new Date(insertArg.run_after).getTime();
    expect(runAfterMs).toBeGreaterThanOrEqual(before + 59_000);
  });

  test("returns null and does not throw on duplicate idempotency key (23505)", async () => {
    mockGetSupabaseServer.mockReturnValue(
      makeInsertDb({ data: null, error: { message: "duplicate key", code: "23505" } }),
    );

    const id = await enqueueJob("referral_reward", {
      referralCode: "X", referredEmail: "e@cs.test", referredFirstName: "Eve",
    }, { idempotencyKey: "referral_reward:e@cs.test" });

    expect(id).toBeNull();  // expected dedup — not an error
  });

  test("returns null and logs on unexpected DB failure", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetSupabaseServer.mockReturnValue(
      makeInsertDb({ data: null, error: { message: "conn refused", code: "PGCONN" } }),
    );

    const id = await enqueueJob("bulk_email", {
      to: "f@cs.test", toName: "Frank", subject: "Hi",
      html: "<p>Hi</p>", campaignId: "camp-1",
    });

    expect(id).toBeNull();
    // logger.error calls console.error with a JSON string — check it contains the key fields
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("bulk_email"),
    );
    spy.mockRestore();
  });
});

// ── completeJob ───────────────────────────────────────────────────────────────

describe("completeJob", () => {
  test("updates status to done with a completed_at timestamp", async () => {
    const db = makeUpdateDb();
    mockGetSupabaseServer.mockReturnValue(db);

    await completeJob("job-id-1");

    const updateArg = db._update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.status).toBe("done");
    expect(typeof updateArg.completed_at).toBe("string");
    expect(db._eq).toHaveBeenCalledWith("id", "job-id-1");
  });
});

// ── failJob ───────────────────────────────────────────────────────────────────

describe("failJob", () => {
  test("sets status=pending with exponential backoff when attempts < max_attempts", async () => {
    const db = makeUpdateDb();
    mockGetSupabaseServer.mockReturnValue(db);

    const before = Date.now();
    await failJob("job-id-2", "SES timeout", 1, 3);

    const arg = db._update.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("pending");
    expect(arg.last_error).toBe("SES timeout");
    // Backoff = 1 × 5 min = 300 s
    const runAfterMs = new Date(arg.run_after as string).getTime();
    expect(runAfterMs).toBeGreaterThan(before + 290_000);
    expect(runAfterMs).toBeLessThan(before + 310_000);
  });

  test("backoff grows with attempt number (exponential)", async () => {
    const dbs = [makeUpdateDb(), makeUpdateDb()];
    mockGetSupabaseServer
      .mockReturnValueOnce(dbs[0])
      .mockReturnValueOnce(dbs[1]);

    const t = Date.now();
    await failJob("j1", "err", 1, 5);
    await failJob("j2", "err", 2, 5);

    const run1 = new Date((dbs[0]._update.mock.calls[0][0] as Record<string, unknown>).run_after as string).getTime();
    const run2 = new Date((dbs[1]._update.mock.calls[0][0] as Record<string, unknown>).run_after as string).getTime();

    expect(run2 - t).toBeGreaterThan(run1 - t);  // attempt 2 → longer backoff
  });

  test("caps backoff at 60 minutes regardless of attempt count", async () => {
    const db = makeUpdateDb();
    mockGetSupabaseServer.mockReturnValue(db);

    const before = Date.now();
    await failJob("j-high", "err", 20, 100);  // 20 attempts → would be 100 min uncapped

    const arg    = db._update.mock.calls[0][0] as Record<string, unknown>;
    const runMs  = new Date(arg.run_after as string).getTime();
    // Must be ≤ 60 min from now
    expect(runMs - before).toBeLessThanOrEqual(3_601_000);
  });

  test("sets status=dead and no backoff when attempts >= max_attempts", async () => {
    const db = makeUpdateDb();
    mockGetSupabaseServer.mockReturnValue(db);

    await failJob("job-id-3", "Permanent failure", 3, 3);

    const arg = db._update.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("dead");
    expect(arg.last_error).toBe("Permanent failure");
  });

  test("truncates error messages longer than 2000 chars", async () => {
    const db = makeUpdateDb();
    mockGetSupabaseServer.mockReturnValue(db);

    await failJob("job-id-4", "x".repeat(5000), 1, 3);

    const arg = db._update.mock.calls[0][0] as Record<string, unknown>;
    expect((arg.last_error as string).length).toBeLessThanOrEqual(2000);
  });
});

// ── claimNextJobs ─────────────────────────────────────────────────────────────

describe("claimNextJobs", () => {
  test("calls claim_next_jobs RPC with correct limit and returns rows", async () => {
    const rows = [
      { id: "j1", job_type: "invoice_generate", payload: {}, status: "running", attempts: 1, max_attempts: 3 },
      { id: "j2", job_type: "event_qr_email",   payload: {}, status: "running", attempts: 1, max_attempts: 3 },
    ];
    const db = makeRpcDb({ data: rows, error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const jobs = await claimNextJobs(7);

    expect(db.rpc).toHaveBeenCalledWith("claim_next_jobs", { p_limit: 7 });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].id).toBe("j1");
  });

  test("returns empty array when no pending jobs", async () => {
    mockGetSupabaseServer.mockReturnValue(makeRpcDb({ data: [], error: null }));
    expect(await claimNextJobs()).toEqual([]);
  });

  test("returns empty array and logs on RPC error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetSupabaseServer.mockReturnValue(
      makeRpcDb({ data: null, error: { message: "deadlock detected" } }),
    );

    const jobs = await claimNextJobs();

    expect(jobs).toEqual([]);
    // logger.error calls console.error with a JSON string — check it contains the key fields
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("claim_next_jobs RPC error"),
    );
    spy.mockRestore();
  });

  test("uses default limit of 15 when no argument provided", async () => {
    const db = makeRpcDb({ data: [], error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    await claimNextJobs();

    expect(db.rpc).toHaveBeenCalledWith("claim_next_jobs", { p_limit: 15 });
  });
});
