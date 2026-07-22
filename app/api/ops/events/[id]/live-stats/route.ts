import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOpsSession } from "@/lib/ops-auth";

// GET /api/ops/events/[id]/live-stats
// Returns real-time counts for the ops dashboard.
// Designed for polling (every ~5s from the dashboard page).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getOpsSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  if (session.eid !== eventId) {
    return NextResponse.json({ error: "Session belongs to a different event" }, { status: 403 });
  }

  const db = getSupabaseServer();

  // Single query: aggregate all service counts in one pass
  const { data, error } = await db
    .from("event_participants")
    .select(
      "status, checked_in_at, tshirt_issued, breakfast_availed, medal_issued, bib_collected_at"
    )
    .eq("event_id", eventId)
    .eq("status", "active")
    .returns<{
      status: string;
      checked_in_at: string | null;
      tshirt_issued: boolean;
      breakfast_availed: boolean;
      medal_issued: boolean;
      bib_collected_at: string | null;
    }[]>();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const rows = data ?? [];
  const total = rows.length;

  const stats = {
    total,
    checkin:   { done: rows.filter(r => r.checked_in_at).length,    label: "Checked In" },
    tshirt:    { done: rows.filter(r => r.tshirt_issued).length,     label: "T-Shirts Issued" },
    breakfast: { done: rows.filter(r => r.breakfast_availed).length, label: "Breakfasts Issued" },
    medal:     { done: rows.filter(r => r.medal_issued).length,      label: "Medals Issued" },
    bib:       { done: rows.filter(r => r.bib_collected_at).length,  label: "BIBs Collected" },
  };

  // Also fetch enabled service configs so dashboard only shows relevant panels
  const { data: configs } = await db
    .from("event_service_configs")
    .select("service_name, enabled, config")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .order("display_order")
    .returns<{ service_name: string; enabled: boolean; config: Record<string, unknown> }[]>();

  // Recent activity (last 20 actions)
  const { data: recentLogs } = await db
    .from("event_service_logs")
    .select("service_name, action, volunteer_email, volunteer_role, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<{
      service_name: string;
      action: string;
      volunteer_email: string | null;
      volunteer_role: string | null;
      created_at: string;
    }[]>();

  return NextResponse.json({
    stats,
    enabled_services: (configs ?? []).map(c => c.service_name),
    recent_activity:  recentLogs ?? [],
    fetched_at:       new Date().toISOString(),
  });
}
