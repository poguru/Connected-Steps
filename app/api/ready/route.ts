import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/ready
// Kubernetes / load-balancer readiness probe.
// Returns 200 when the instance can serve traffic: DB is reachable and
// required env vars are set. Returns 503 when not ready.
//
// Unlike /api/health, this probe is binary — 200 or 503 — and is used
// by infrastructure to decide whether to route traffic to this instance.

export async function GET() {
  const checks: string[] = [];

  // Required env vars — missing any = not ready
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RAZORPAY_KEY_SECRET", "COACH_TOKEN_SECRET"];
  for (const key of required) {
    if (!process.env[key]) checks.push(`missing_env:${key}`);
  }

  // Database reachability
  try {
    const db = getSupabaseServer();
    const { error } = await db.from("cron_runs").select("id").limit(1);
    if (error) checks.push(`db:${error.message.slice(0, 60)}`);
  } catch (e: unknown) {
    checks.push(`db:${e instanceof Error ? e.message.slice(0, 60) : "unreachable"}`);
  }

  if (checks.length > 0) {
    return NextResponse.json({ ready: false, failures: checks }, { status: 503 });
  }

  return NextResponse.json({ ready: true }, { status: 200 });
}
