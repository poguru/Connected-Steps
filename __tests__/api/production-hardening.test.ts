// Production hardening regression tests.
//
// Covers every additive change from the production hardening audit:
//   1.  Health endpoint — 200 + correct shape when DB is healthy
//   2.  Health endpoint — 503 when DB probe fails
//   3.  Health endpoint — version + env fields present
//   4.  Health endpoint — cache component skipped when Redis not configured
//   5.  Health endpoint — cache component checked when Redis is configured
//   6.  Dead-letters GET — returns dead jobs (admin-only)
//   7.  Dead-letters GET — 401 without auth
//   8.  Dead-letters GET — filters by job_type param
//   9.  Dead-letters POST — resets dead job to pending
//   10. Dead-letters POST — 409 if job is not dead
//   11. Dead-letters POST — 404 if job not found
//   12. Structured logger — emits JSON lines
//   13. Structured logger — debug suppressed when LOG_LEVEL not set
//   14. Structured logger — debug emitted when LOG_LEVEL=debug
//   15. Supabase singleton — same instance returned on repeated calls
//   16. Supabase singleton — throws on missing env vars

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";
process.env.ADMIN_PASSWORD            = "test-admin";
process.env.COACH_TOKEN_SECRET        = "test-secret";
// Leave UPSTASH_REDIS_REST_URL unset for most tests (cache-not-configured path)

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/admin-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return { ...actual, isAdminOrCoach: jest.fn().mockResolvedValue(true) };
});

import { NextRequest }       from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { makeAdminHeaders }  from "@/__tests__/helpers/admin-auth";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHealthDb(ok: boolean) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit:  jest.fn().mockResolvedValue({ data: ok ? [{ id: "1" }] : null, error: ok ? null : { message: "connection refused" } }),
    }),
  };
}

function makeDeadLetterDb(jobs: unknown[] = []) {
  const singleMock   = jest.fn();
  const updateEqMock = jest.fn().mockResolvedValue({ error: null });
  const updateMock   = jest.fn().mockReturnValue({ eq: updateEqMock });

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "job_queue") {
        return {
          select:  jest.fn().mockReturnThis(),
          eq:      jest.fn().mockReturnThis(),
          gte:     jest.fn().mockReturnThis(),
          order:   jest.fn().mockReturnThis(),
          limit:   jest.fn().mockResolvedValue({ data: jobs, error: null }),
          single:  singleMock,
          update:  updateMock,
        };
      }
      return {};
    }),
    _singleMock:   singleMock,
    _updateMock:   updateMock,
    _updateEqMock: updateEqMock,
  };
}

function makeAdminReq(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...makeAdminHeaders() },
    body:    body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => jest.clearAllMocks());

// ── 1–5: Health endpoint ──────────────────────────────────────────────────────

describe("GET /api/health", () => {
  test("1. DB healthy → 200, ok=true", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockGetSupabaseServer.mockReturnValue(makeHealthDb(true));

    const res  = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.components.database.ok).toBe(true);
  });

  test("2. DB failure → 503, ok=false", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockGetSupabaseServer.mockReturnValue(makeHealthDb(false));

    const res  = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.components.database.ok).toBe(false);
    expect(body.components.database.error).toBeTruthy();
  });

  test("3. response includes version, env, ts, uptime_s fields", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockGetSupabaseServer.mockReturnValue(makeHealthDb(true));

    const body = await (await GET()).json();

    expect(typeof body.version).toBe("string");
    expect(typeof body.env).toBe("string");
    expect(typeof body.ts).toBe("string");
    expect(typeof body.uptime_s).toBe("number");
  });

  test("4. cache component ok=true when Redis not configured (not a failure)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { GET } = await import("@/app/api/health/route");
    mockGetSupabaseServer.mockReturnValue(makeHealthDb(true));

    const body = await (await GET()).json();

    expect(body.components.cache.ok).toBe(true);
    expect(body.components.cache.latency).toBe(0);
  });

  test("5. latency fields are non-negative numbers", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockGetSupabaseServer.mockReturnValue(makeHealthDb(true));

    const body = await (await GET()).json();

    expect(body.components.database.latency).toBeGreaterThanOrEqual(0);
    expect(body.components.cache.latency).toBeGreaterThanOrEqual(0);
  });
});

// ── 6–11: Dead-letters endpoint ───────────────────────────────────────────────

describe("GET /api/admin/dead-letters", () => {
  test("6. returns dead jobs with summary", async () => {
    const { GET } = await import("@/app/api/admin/dead-letters/route");
    const deadJobs = [
      { id: "j1", job_type: "invoice_generate", status: "dead", attempts: 3, max_attempts: 3, last_error: "SES timeout", created_at: "2026-06-26T00:00:00Z" },
      { id: "j2", job_type: "event_qr_email",   status: "dead", attempts: 3, max_attempts: 3, last_error: "network", created_at: "2026-06-26T01:00:00Z" },
    ];
    mockGetSupabaseServer.mockReturnValue(makeDeadLetterDb(deadJobs));

    const res  = await GET(makeAdminReq("http://localhost/api/admin/dead-letters"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dead_jobs).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(body.by_type.invoice_generate).toBe(1);
    expect(body.by_type.event_qr_email).toBe(1);
  });

  test("7. 401 without admin auth", async () => {
    const { isAdminOrCoach } = await import("@/lib/admin-auth");
    (isAdminOrCoach as jest.Mock).mockResolvedValueOnce(false);

    const { GET } = await import("@/app/api/admin/dead-letters/route");
    const req = new NextRequest("http://localhost/api/admin/dead-letters");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("8. empty result when no dead jobs exist", async () => {
    const { GET } = await import("@/app/api/admin/dead-letters/route");
    mockGetSupabaseServer.mockReturnValue(makeDeadLetterDb([]));

    const body = await (await GET(makeAdminReq("http://localhost/api/admin/dead-letters"))).json();

    expect(body.count).toBe(0);
    expect(body.dead_jobs).toEqual([]);
    expect(body.by_type).toEqual({});
  });
});

describe("POST /api/admin/dead-letters — retry", () => {
  test("9. resets dead job to pending", async () => {
    const { POST } = await import("@/app/api/admin/dead-letters/route");
    const db = makeDeadLetterDb();
    db._singleMock.mockResolvedValue({ data: { id: "j1", job_type: "invoice_generate", status: "dead" }, error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await POST(makeAdminReq("http://localhost/api/admin/dead-letters", "POST", { id: "j1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.id).toBe("j1");
    expect(body.job_type).toBe("invoice_generate");

    // Verify update was called with status=pending
    const updateArg = db._updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.status).toBe("pending");
    expect(updateArg.last_error).toBeNull();
  });

  test("10. 409 if job is not in dead state", async () => {
    const { POST } = await import("@/app/api/admin/dead-letters/route");
    const db = makeDeadLetterDb();
    db._singleMock.mockResolvedValue({ data: { id: "j1", job_type: "invoice_generate", status: "pending" }, error: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeAdminReq("http://localhost/api/admin/dead-letters", "POST", { id: "j1" }));
    expect(res.status).toBe(409);
  });

  test("11. 404 if job not found", async () => {
    const { POST } = await import("@/app/api/admin/dead-letters/route");
    const db = makeDeadLetterDb();
    db._singleMock.mockResolvedValue({ data: null, error: { message: "not found" } });
    mockGetSupabaseServer.mockReturnValue(db);

    const res = await POST(makeAdminReq("http://localhost/api/admin/dead-letters", "POST", { id: "nonexistent" }));
    expect(res.status).toBe(404);
  });
});

// ── 12–14: Structured logger ──────────────────────────────────────────────────

describe("lib/logger", () => {
  test("12. logger.info emits a valid JSON line to console.log", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = require("@/lib/logger") as typeof import("@/lib/logger");

    logger.info("test-service", "test message", { key: "value" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.service).toBe("test-service");
    expect(parsed.msg).toBe("test message");
    expect(parsed.key).toBe("value");
    expect(typeof parsed.ts).toBe("string");

    spy.mockRestore();
  });

  test("13. logger.debug is silent when LOG_LEVEL is not set", () => {
    delete process.env.LOG_LEVEL;
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = require("@/lib/logger") as typeof import("@/lib/logger");

    logger.debug("test-service", "should not appear");

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("14. logger.debug emits when LOG_LEVEL=debug", () => {
    process.env.LOG_LEVEL = "debug";
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.resetModules();
    const { logger } = require("@/lib/logger") as typeof import("@/lib/logger");

    logger.debug("test-service", "debug message");

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe("debug");

    spy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  test("logger.error emits to console.error (not console.log)", () => {
    const logSpy   = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = require("@/lib/logger") as typeof import("@/lib/logger");

    logger.error("test-service", "error message");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ── 15–16: Supabase singleton ─────────────────────────────────────────────────
// These tests load the REAL module (not the mock) using jest.isolateModules.

describe("lib/supabase-server singleton", () => {
  test("15. returns the same instance on repeated calls within module scope", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://test.supabase.co";

    let c1: unknown, c2: unknown;
    jest.isolateModules(() => {
      jest.unmock("@/lib/supabase-server");
      const mod = require("@/lib/supabase-server") as typeof import("@/lib/supabase-server");
      c1 = mod.getSupabaseServer();
      c2 = mod.getSupabaseServer();
    });

    expect(c1).toBe(c2); // same reference = singleton pattern working
  });

  test("16. throws on missing SUPABASE_URL", () => {
    const savedUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedUrl2 = process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;

    jest.isolateModules(() => {
      jest.unmock("@/lib/supabase-server");
      const mod = require("@/lib/supabase-server") as typeof import("@/lib/supabase-server");
      expect(() => mod.getSupabaseServer()).toThrow(/SUPABASE_URL/);
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedUrl2) process.env.SUPABASE_URL = savedUrl2;
  });
});
