// Tests for app/api/cron/job-worker/route.ts
//
// Covers: auth, no-jobs early return, dispatch to each handler type,
// done/failed/dead accounting, fault isolation (one failure doesn't
// stop remaining jobs), and response shape.

process.env.CRON_SECRET               = "test-cron-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

jest.mock("@/lib/job-queue", () => ({
  claimNextJobs: jest.fn(),
  completeJob:   jest.fn(),
  failJob:       jest.fn(),
}));

jest.mock("@/lib/job-handlers", () => ({
  handleInvoiceGenerate:     jest.fn(),
  handleEventQrEmail:        jest.fn(),
  handleMembershipEmail:     jest.fn(),
  handleReferralReward:      jest.fn(),
  handleBulkEmail:           jest.fn(),
  handleBulkInvoice:         jest.fn(),
  handleWeeklyDigestEmail:   jest.fn(),
  handleCertificateGenerate: jest.fn(),
}));

import { NextRequest }                    from "next/server";
import { GET }                            from "@/app/api/cron/job-worker/route";
import { claimNextJobs, completeJob, failJob } from "@/lib/job-queue";
import {
  handleInvoiceGenerate,
  handleEventQrEmail,
  handleMembershipEmail,
  handleReferralReward,
  handleBulkEmail,
  handleBulkInvoice,
  handleWeeklyDigestEmail,
  handleCertificateGenerate,
} from "@/lib/job-handlers";

const mockClaim       = claimNextJobs as jest.Mock;
const mockComplete    = completeJob   as jest.Mock;
const mockFail        = failJob       as jest.Mock;

const HANDLERS: Record<string, jest.Mock> = {
  invoice_generate:     handleInvoiceGenerate     as jest.Mock,
  event_qr_email:       handleEventQrEmail        as jest.Mock,
  membership_email:     handleMembershipEmail      as jest.Mock,
  referral_reward:      handleReferralReward       as jest.Mock,
  bulk_email:           handleBulkEmail            as jest.Mock,
  bulk_invoice:         handleBulkInvoice          as jest.Mock,
  weekly_digest_email:  handleWeeklyDigestEmail    as jest.Mock,
  certificate_generate: handleCertificateGenerate  as jest.Mock,
};

function makeRequest(secret = "test-cron-secret"): NextRequest {
  return new NextRequest("http://localhost/api/cron/job-worker", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

function makeJob(overrides: Partial<{
  id: string; job_type: string; payload: Record<string, unknown>;
  attempts: number; max_attempts: number;
}> = {}) {
  return {
    id:              "job-1",
    job_type:        "invoice_generate",
    payload:         { userEmail: "a@cs.test" },
    status:          "running",
    priority:        0,
    attempts:        1,
    max_attempts:    3,
    last_error:      null,
    idempotency_key: null,
    claimed_at:      new Date().toISOString(),
    completed_at:    null,
    created_at:      new Date().toISOString(),
    run_after:       new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all handlers succeed, completeJob and failJob are no-ops
  Object.values(HANDLERS).forEach(h => h.mockResolvedValue(undefined));
  mockComplete.mockResolvedValue(undefined);
  mockFail.mockResolvedValue(undefined);
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("auth", () => {
  test("returns 401 when Authorization header is missing", async () => {
    const req = new NextRequest("http://localhost/api/cron/job-worker");
    expect((await GET(req)).status).toBe(401);
  });

  test("returns 401 when secret is wrong", async () => {
    expect((await GET(makeRequest("wrong"))).status).toBe(401);
  });

  test("returns 200 with correct secret", async () => {
    mockClaim.mockResolvedValue([]);
    expect((await GET(makeRequest())).status).toBe(200);
  });
});

// ── No pending jobs ───────────────────────────────────────────────────────────

describe("no pending jobs", () => {
  test("returns processed=0 and does not call any handler", async () => {
    mockClaim.mockResolvedValue([]);

    const body = await (await GET(makeRequest())).json();

    expect(body.ok).toBe(true);
    expect(body.processed).toBe(0);
    expect(mockComplete).not.toHaveBeenCalled();
  });
});

// ── Dispatch: every job type reaches its handler ──────────────────────────────

describe("dispatch", () => {
  const jobTypes = Object.keys(HANDLERS) as (keyof typeof HANDLERS)[];

  test.each(jobTypes)("%s → dispatched to correct handler and marked done", async (jobType) => {
    const job = makeJob({ job_type: jobType });
    mockClaim.mockResolvedValue([job]);

    const body = await (await GET(makeRequest())).json();

    expect(HANDLERS[jobType]).toHaveBeenCalledWith(job.payload);
    expect(mockComplete).toHaveBeenCalledWith(job.id);
    expect(body.done).toBe(1);
  });
});

// ── Unknown job type ──────────────────────────────────────────────────────────

describe("unknown job type", () => {
  test("calls failJob and counts as failed (not dead) when attempts < max", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockClaim.mockResolvedValue([makeJob({ job_type: "no_such_type", attempts: 1, max_attempts: 3 })]);

    const body = await (await GET(makeRequest())).json();

    expect(mockFail).toHaveBeenCalled();
    expect(body.failed).toBe(1);
    spy.mockRestore();
  });
});

// ── Failure / retry / dead ────────────────────────────────────────────────────

describe("failure handling", () => {
  test("handler throwing marks job failed and calls failJob", async () => {
    const job = makeJob({ attempts: 1, max_attempts: 3 });
    mockClaim.mockResolvedValue([job]);
    (handleInvoiceGenerate as jest.Mock).mockRejectedValue(new Error("SES timeout"));

    const body = await (await GET(makeRequest())).json();

    expect(mockFail).toHaveBeenCalledWith(job.id, "SES timeout", 1, 3);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(body.failed).toBe(1);
    expect(body.done).toBe(0);
    expect(body.dead).toBe(0);
  });

  test("counts as dead when attempts === max_attempts", async () => {
    const job = makeJob({ attempts: 3, max_attempts: 3 });
    mockClaim.mockResolvedValue([job]);
    (handleInvoiceGenerate as jest.Mock).mockRejectedValue(new Error("Permanent"));

    const body = await (await GET(makeRequest())).json();

    expect(body.dead).toBe(1);
    expect(body.failed).toBe(0);
  });

  test("non-Error rejections are stringified for failJob", async () => {
    const job = makeJob();
    mockClaim.mockResolvedValue([job]);
    (handleInvoiceGenerate as jest.Mock).mockRejectedValue("string error");

    await GET(makeRequest());

    expect(mockFail).toHaveBeenCalledWith(job.id, "string error", expect.any(Number), expect.any(Number));
  });
});

// ── Fault isolation ───────────────────────────────────────────────────────────

describe("fault isolation", () => {
  test("failure in one job does not stop processing of subsequent jobs", async () => {
    const jobs = [
      makeJob({ id: "j1", job_type: "invoice_generate" }),
      makeJob({ id: "j2", job_type: "event_qr_email" }),
      makeJob({ id: "j3", job_type: "membership_email" }),
    ];
    mockClaim.mockResolvedValue(jobs);

    // Only the first job fails
    (handleInvoiceGenerate  as jest.Mock).mockRejectedValue(new Error("fail"));
    (handleEventQrEmail     as jest.Mock).mockResolvedValue(undefined);
    (handleMembershipEmail  as jest.Mock).mockResolvedValue(undefined);

    const body = await (await GET(makeRequest())).json();

    expect(body.processed).toBe(3);
    expect(body.done).toBe(2);
    expect(body.failed).toBe(1);
    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(mockFail).toHaveBeenCalledTimes(1);
  });

  test("all jobs succeed → done=N, failed=0, dead=0", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) =>
      makeJob({ id: `j${i}`, job_type: "bulk_invoice" }),
    );
    mockClaim.mockResolvedValue(jobs);

    const body = await (await GET(makeRequest())).json();

    expect(body.done).toBe(5);
    expect(body.failed).toBe(0);
    expect(body.dead).toBe(0);
  });

  test("all jobs fail → done=0, processed=N, each failJob called", async () => {
    const n = 4;
    const jobs = Array.from({ length: n }, (_, i) => makeJob({ id: `j${i}` }));
    mockClaim.mockResolvedValue(jobs);
    (handleInvoiceGenerate as jest.Mock).mockRejectedValue(new Error("boom"));

    const body = await (await GET(makeRequest())).json();

    expect(body.done).toBe(0);
    expect(body.processed).toBe(n);
    expect(mockFail).toHaveBeenCalledTimes(n);
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe("response shape", () => {
  test("no-jobs response has ok, processed, durationMs", async () => {
    mockClaim.mockResolvedValue([]);

    const body = await (await GET(makeRequest())).json();

    expect(body).toMatchObject({
      ok:         true,
      processed:  0,
      durationMs: expect.any(Number),
    });
    expect(body.done).toBeUndefined();  // not present when no jobs
  });

  test("with-jobs response has ok, processed, done, failed, dead, durationMs", async () => {
    mockClaim.mockResolvedValue([makeJob()]);

    const body = await (await GET(makeRequest())).json();

    expect(body).toMatchObject({
      ok:         true,
      processed:  1,
      done:       1,
      failed:     0,
      dead:       0,
      durationMs: expect.any(Number),
    });
  });

  test("durationMs is a non-negative number", async () => {
    mockClaim.mockResolvedValue([makeJob()]);

    const body = await (await GET(makeRequest())).json();

    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ── Regression: idempotency keys prevent re-processing ───────────────────────

describe("regression: handlers receive exact payload from job row", () => {
  test("handler receives the full payload stored in the job row", async () => {
    const payload = {
      referralCode:      "XYZ9876",
      referredEmail:     "test@cs.test",
      referredFirstName: "Tester",
    };
    const job = makeJob({ job_type: "referral_reward", payload });
    mockClaim.mockResolvedValue([job]);

    await GET(makeRequest());

    expect(handleReferralReward).toHaveBeenCalledWith(payload);
  });

  test("two separate invocations each process different jobs", async () => {
    const job1 = makeJob({ id: "j1", job_type: "bulk_email", payload: { to: "a@x.com" } });
    const job2 = makeJob({ id: "j2", job_type: "bulk_email", payload: { to: "b@x.com" } });

    mockClaim
      .mockResolvedValueOnce([job1])
      .mockResolvedValueOnce([job2]);

    await GET(makeRequest());
    await GET(makeRequest());

    const calls = (handleBulkEmail as jest.Mock).mock.calls;
    expect(calls[0][0]).toMatchObject({ to: "a@x.com" });
    expect(calls[1][0]).toMatchObject({ to: "b@x.com" });
  });
});
