import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/health
// Probes database, cache, job queue, and critical env vars.
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

interface JobQueueStatus extends ComponentStatus {
  pending?: number;
  dead?:    number;
}

interface EnvStatus {
  ok:        boolean;
  configured: boolean;
}

interface HealthResponse {
  ok:        boolean;
  version:   string;
  env:       string;
  ts:        string;
  uptime_s:  number;
  components: {
    database:  ComponentStatus;
    cache:     ComponentStatus;
    job_queue: JobQueueStatus;
    email:     EnvStatus;
    whatsapp:  EnvStatus;
  };
}

const startMs = Date.now();

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const components: HealthResponse["components"] = {
    database:  { ok: false, latency: 0 },
    cache:     { ok: false, latency: 0 },
    job_queue: { ok: false, latency: 0 },
    email:     { ok: false, configured: false },
    whatsapp:  { ok: false, configured: false },
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

  // ── Job queue probe ───────────────────────────────────────────────────────
  // Count pending and dead jobs — dead jobs are an alert signal.
  // Dead count > 0 marks this component degraded (needs manual review).
  const jqStart = Date.now();
  try {
    const db = getSupabaseServer();
    const [pendingRes, deadRes] = await Promise.all([
      db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "dead"),
    ]);

    const pendingCount = pendingRes.count ?? 0;
    const deadCount    = deadRes.count    ?? 0;

    components.job_queue = {
      ok:      !pendingRes.error && !deadRes.error && deadCount === 0,
      latency: Date.now() - jqStart,
      pending: pendingCount,
      dead:    deadCount,
      error:   pendingRes.error?.message ?? deadRes.error?.message,
    };
  } catch (e: unknown) {
    components.job_queue = {
      ok:      false,
      latency: Date.now() - jqStart,
      error:   e instanceof Error ? e.message : "unknown",
    };
  }

  // ── Email service probe ───────────────────────────────────────────────────
  // ZeptoMail integration — just verify env is configured (pinging would use quota).
  const emailConfigured = !!process.env.ZEPTOMAIL_API_KEY;
  components.email = { ok: emailConfigured, configured: emailConfigured };

  // ── WhatsApp probe ────────────────────────────────────────────────────────
  const waConfigured = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  components.whatsapp = { ok: waConfigured, configured: waConfigured };

  const allOk = components.database.ok && components.cache.ok;  // hard failures only

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
