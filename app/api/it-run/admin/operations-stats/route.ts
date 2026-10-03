import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/operations-stats
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Total participants for this event
  const { count: totalParticipants } = await db
    .from("it_run_participants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);

  // Get entitlement counts from today
  const today = new Date().toISOString().split("T")[0];
  const { data: entitlements } = await db
    .from("it_run_event_entitlements")
    .select("entitlement_type, status")
    .eq("event_id", event.id)
    .eq("status", "issued")
    .gte("issued_at", `${today}T00:00:00Z`)
    .lt("issued_at", `${today}T23:59:59Z`);

  const counts: Record<string, number> = {
    BIB: 0,
    BREAKFAST: 0,
    GOODIES: 0,
    TSHIRT: 0,
    MEDAL: 0,
    CERTIFICATE: 0,
  };

  (entitlements ?? []).forEach((e: any) => {
    if (counts.hasOwnProperty(e.entitlement_type)) {
      counts[e.entitlement_type]++;
    }
  });

  // Active staff
  const { count: staffActive } = await db
    .from("it_run_staff")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "active");

  return NextResponse.json({
    stats: {
      totalParticipants: totalParticipants || 0,
      bibCollected: counts.BIB,
      checkedIn: 0, // Check-in is tracked separately in it_run_checkins
      breakfastIssued: counts.BREAKFAST,
      goodiesIssued: counts.GOODIES,
      tshirtIssued: counts.TSHIRT,
      medalIssued: counts.MEDAL,
      certificateIssued: counts.CERTIFICATE,
      staffActive: staffActive || 0,
    },
  });
}
