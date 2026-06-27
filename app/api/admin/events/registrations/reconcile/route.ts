import { NextRequest, NextResponse } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { runReconciliation } from "@/lib/payment-reconcile";

// GET /api/admin/events/registrations/reconcile  → dry_run=true (report only)
// POST /api/admin/events/registrations/reconcile → dry_run=false (actually recovers)
//
// Query/body params:
//   event_id  uuid    optional — limit to one event
//   dry_run   bool    GET always dry_run; POST defaults to false

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp      = req.nextUrl.searchParams;
  const eventId = sp.get("event_id") ?? undefined;

  try {
    const result = await runReconciliation({ eventId, dryRun: true, callerLabel: "admin-manual" });
    return NextResponse.json({ ...result, dry_run: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body    = await req.json().catch(() => ({})) as Record<string, unknown>;
  const eventId = (body.event_id as string | undefined) ?? undefined;
  const dryRun  = body.dry_run === true;

  try {
    const result = await runReconciliation({ eventId, dryRun, callerLabel: "admin-manual" });
    return NextResponse.json({ ...result, dry_run: dryRun });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
