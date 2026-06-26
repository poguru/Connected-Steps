import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/dead-letters
// Returns jobs that exhausted all retry attempts (status = 'dead').
// Provides visibility into persistent failures without changing any logic.
//
// Query params:
//   limit     int   max rows (default 50, max 200)
//   job_type  str   filter by job type (optional)
//   since     str   ISO timestamp — only show jobs failed after this time
//
// POST /api/admin/dead-letters/[id]/retry
// (See /api/admin/dead-letters/[id]/route.ts — not implemented here)
// Resets a dead job to 'pending' so the worker retries it.

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp       = req.nextUrl.searchParams;
  const limit    = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const jobType  = sp.get("job_type") ?? "";
  const since    = sp.get("since")    ?? "";

  const db = getSupabaseServer();

  let q = db
    .from("job_queue")
    .select(
      "id, job_type, payload, status, attempts, max_attempts, last_error, " +
      "idempotency_key, claimed_at, completed_at, created_at, run_after",
    )
    .eq("status", "dead")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobType) q = q.eq("job_type", jobType) as typeof q;
  if (since)   q = q.gte("created_at", since)  as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary counts by job type
  const byType: Record<string, number> = {};
  for (const job of data ?? []) {
    byType[job.job_type] = (byType[job.job_type] ?? 0) + 1;
  }

  return NextResponse.json({
    dead_jobs: data ?? [],
    count:     (data ?? []).length,
    by_type:   byType,
  });
}

// POST /api/admin/dead-letters — retry a specific dead job by ID.
// Resets status to 'pending' and clears last_error so the worker picks it up.
// Does NOT reset attempts, preserving the audit trail.

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Verify the job is dead before resetting
  const { data: job } = await db
    .from("job_queue")
    .select("id, job_type, status")
    .eq("id", id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "dead") {
    return NextResponse.json({ error: `Job is ${job.status}, not dead` }, { status: 409 });
  }

  const { error } = await db
    .from("job_queue")
    .update({
      status:     "pending",
      last_error: null,
      run_after:  new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok:       true,
    id,
    job_type: job.job_type,
    message:  "Job reset to pending — will be claimed on next worker run",
  });
}
