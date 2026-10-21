import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";
import {
  recordJourneyEvent,
  FUNNEL_STAGES,
  isValidJourneyKey,
  isMonitoredEndpoint,
  isReportableStatus,
  isAlertableFailure,
  checkFailureAlert,
  type FunnelStage,
} from "@/lib/it-run-monitoring";

// POST /api/it-run/monitoring/event
// Body: { journeyKey, stage } to record a registration stage, or { journeyKey, kind: "error", endpoint, httpStatus }
// to record a failed request. Anonymous, rate limited, and it always answers 204 so monitoring can never change what a
// visitor sees. Holds no personal data: failures are stored as an endpoint and a status code, never a message or body.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkAndRecordEndpointLimit(`itr:monitor-event:${ip}`, 120, 60_000);
    if (rl.limited) return new NextResponse(null, { status: 204 });

    const body = await req.json().catch(() => ({})) as {
      journeyKey?: unknown; stage?: unknown; kind?: unknown; endpoint?: unknown; httpStatus?: unknown;
    };
    if (!isValidJourneyKey(body.journeyKey)) return new NextResponse(null, { status: 204 });

    const { data: event } = await getSupabaseServer()
      .from("it_run_events")
      .select("id")
      .eq("slug", "sprint-2")
      .maybeSingle<{ id: string }>();

    if (body.kind === "error") {
      if (!isMonitoredEndpoint(body.endpoint) || !isReportableStatus(body.httpStatus)) return new NextResponse(null, { status: 204 });
      const stored = await recordJourneyEvent({
        journeyKey: body.journeyKey,
        eventId: event?.id ?? null,
        eventType: "error",
        endpoint: body.endpoint,
        httpStatus: body.httpStatus,
      });
      if (stored && isAlertableFailure(body.httpStatus)) await checkFailureAlert(event?.id ?? null);
      return new NextResponse(null, { status: 204 });
    }

    const stage = FUNNEL_STAGES.find(s => s === body.stage) as FunnelStage | undefined;
    if (!stage) return new NextResponse(null, { status: 204 });

    await recordJourneyEvent({
      journeyKey: body.journeyKey,
      eventId: event?.id ?? null,
      eventType: "stage_reached",
      stage,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
