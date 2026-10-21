import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import {
  summarizeJourneys,
  summarizeErrors,
  ACTIVE_WINDOW_MINUTES,
  ABANDON_AFTER_MINUTES,
  FUNNEL_STAGES,
  ERROR_ALERT_THRESHOLD,
} from "@/lib/it-run-monitoring";

// GET /api/it-run/admin/monitoring?days=7
// Registration journey counts and failed-request counts for the IT Run event. Event admins only. Holds no personal data.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const days = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? "7") || 7));
  const db = getSupabaseServer();

  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404, headers: NO_STORE });

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await db
    .from("registration_journeys")
    .select("completed_at, last_activity_at, current_stage")
    .eq("event_id", event.id)
    .gte("started_at", since)
    .limit(5000)
    .returns<Array<{ completed_at: string | null; last_activity_at: string; current_stage: string }>>();
  if (error) {
    console.error("[it-run/admin/monitoring] read failed:", error.code ?? "unknown");
    return NextResponse.json({ error: "Could not load monitoring data" }, { status: 500, headers: NO_STORE });
  }

  const { data: failures, error: failErr } = await db
    .from("registration_journey_events")
    .select("endpoint, http_status, created_at, registration_journeys!inner(event_id)")
    .eq("event_type", "error")
    .eq("registration_journeys.event_id", event.id)
    .gte("created_at", since)
    .limit(5000)
    .returns<Array<{ endpoint: string | null; http_status: number | null; created_at: string }>>();
  if (failErr) {
    console.error("[it-run/admin/monitoring] failure read failed:", failErr.code ?? "unknown");
    return NextResponse.json({ error: "Could not load monitoring data" }, { status: 500, headers: NO_STORE });
  }

  const nowMs = Date.now();
  const summary = summarizeJourneys(
    (rows ?? []).map(r => ({ completedAt: r.completed_at, lastActivityAt: r.last_activity_at, currentStage: r.current_stage })),
    nowMs,
  );
  const errors = summarizeErrors(
    (failures ?? []).filter(f => f.endpoint).map(f => ({ endpoint: f.endpoint as string, httpStatus: f.http_status, createdAt: f.created_at })),
    nowMs,
  );
  return NextResponse.json({
    periodDays: days,
    activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
    abandonAfterMinutes: ABANDON_AFTER_MINUTES,
    stages: FUNNEL_STAGES,
    alertThreshold: ERROR_ALERT_THRESHOLD,
    generatedAt: new Date().toISOString(),
    summary,
    errors,
  }, { headers: NO_STORE });
}
