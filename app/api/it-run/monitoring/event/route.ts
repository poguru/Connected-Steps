import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";
import { recordJourneyEvent, FUNNEL_STAGES, isValidJourneyKey, type FunnelStage } from "@/lib/it-run-monitoring";

// POST /api/it-run/monitoring/event
// Body: { journeyKey, stage }. Records that a registration journey reached a stage. Anonymous, rate limited, and it
// always answers 204 so monitoring can never change what a visitor sees. Holds no personal data.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkAndRecordEndpointLimit(`itr:monitor-event:${ip}`, 120, 60_000);
    if (rl.limited) return new NextResponse(null, { status: 204 });

    const body = await req.json().catch(() => ({})) as { journeyKey?: unknown; stage?: unknown };
    if (!isValidJourneyKey(body.journeyKey)) return new NextResponse(null, { status: 204 });
    const stage = FUNNEL_STAGES.find(s => s === body.stage) as FunnelStage | undefined;
    if (!stage) return new NextResponse(null, { status: 204 });

    const { data: event } = await getSupabaseServer()
      .from("it_run_events")
      .select("id")
      .eq("slug", "sprint-2")
      .maybeSingle<{ id: string }>();

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
