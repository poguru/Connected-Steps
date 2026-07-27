import { NextResponse } from "next/server";

// GET /api/live
// Kubernetes / load-balancer liveness probe.
// Returns 200 when the process is alive. If this endpoint fails to respond,
// the orchestrator should restart the container/instance.
//
// Intentionally minimal — no external calls. A liveness check that hits the DB
// risks cascading restarts when the DB is temporarily slow.

export async function GET() {
  return NextResponse.json({ alive: true, ts: new Date().toISOString() }, { status: 200 });
}
