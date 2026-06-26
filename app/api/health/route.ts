import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/health
// Probes the database and returns component statuses.
// Used by monitoring systems, uptime checks, and deployment readiness gates.
//
// Response shape is STABLE — do not remove fields; only add optional ones.
//
// 200 = all components healthy
// 503 = one or more components degraded (request still returns JSON)

interface ComponentStatus {
  ok:      boolean;
  latency: number;   // milliseconds
  error?:  string;
}

interface HealthResponse {
  ok:        boolean;
  version:   string;
  env:       string;
  ts:        string;
  uptime_s:  number;
  components: {
    database: ComponentStatus;
    cache:    ComponentStatus;
  };
}

const startMs = Date.now();

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const components: HealthResponse["components"] = {
    database: { ok: false, latency: 0 },
    cache:    { ok: false, latency: 0 },
  };

  // ── Database probe ────────────────────────────────────────────────────────
  // Single lightweight read from cron_runs (always exists, tiny table).
  // Validates Postgres connectivity and service-role key.
  const dbStart = Date.now();
  try {
    const db = getSupabaseServer();
    const { error } = await db
      .from("cron_runs")
      .select("id")
      .limit(1);
    components.database = {
      ok:      !error,
      latency: Date.now() - dbStart,
      error:   error?.message,
    };
  } catch (e: unknown) {
    components.database = {
      ok:      false,
      latency: Date.now() - dbStart,
      error:   e instanceof Error ? e.message : "unknown",
    };
  }

  // ── Cache probe ───────────────────────────────────────────────────────────
  // Lightweight Upstash Redis GET — validates cache connectivity.
  // If Redis is not configured, marks as ok (cache is optional).
  const cacheStart = Date.now();
  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    components.cache = { ok: true, latency: 0 };  // not configured — not a failure
  } else {
    try {
      const res = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        cache:   "no-store",
      });
      const data = await res.json() as { result?: string };
      components.cache = {
        ok:      res.ok && data.result === "PONG",
        latency: Date.now() - cacheStart,
        error:   res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (e: unknown) {
      components.cache = {
        ok:      false,
        latency: Date.now() - cacheStart,
        error:   e instanceof Error ? e.message : "unknown",
      };
    }
  }

  const allOk = components.database.ok && components.cache.ok;

  const body: HealthResponse = {
    ok:        allOk,
    version:   process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    env:       process.env.NODE_ENV ?? "unknown",
    ts:        new Date().toISOString(),
    uptime_s:  Math.round((Date.now() - startMs) / 1000),
    components,
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
