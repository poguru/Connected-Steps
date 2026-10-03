import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/staff-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/staff/stats
// Get today's stats for this staff member
export async function GET(req: NextRequest) {
  const session = requireStaffRole(req, ["super_admin", "event_admin", "bib_staff", "checkin_staff", "breakfast_staff", "goodies_staff", "tshirt_staff", "medal_staff"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();
  const today = new Date().toISOString().split("T")[0];

  // Get counts from it_run_entitlement_issues for today
  const { data: issues } = await db
    .from("it_run_entitlement_issues")
    .select("entitlement_type, result")
    .eq("event_id", session.eventId)
    .eq("staff_id", session.staffId)
    .gte("timestamp", `${today}T00:00:00Z`)
    .lt("timestamp", `${today}T23:59:59Z`);

  const stats: Record<string, number> = {
    bibCollected: 0,
    checkedIn: 0,
    breakfastIssued: 0,
    goodiesIssued: 0,
    tshirtIssued: 0,
    medalIssued: 0,
    certificateIssued: 0,
  };

  const typeMap: Record<string, keyof typeof stats> = {
    BIB: "bibCollected",
    BREAKFAST: "breakfastIssued",
    GOODIES: "goodiesIssued",
    TSHIRT: "tshirtIssued",
    MEDAL: "medalIssued",
    CERTIFICATE: "certificateIssued",
  };

  (issues ?? []).forEach((issue: any) => {
    if (issue.result === "success") {
      const key = typeMap[issue.entitlement_type];
      if (key) stats[key]++;
    }
  });

  // Check-in count from it_run_staff_activity_log
  const { data: checkins } = await db
    .from("it_run_staff_activity_log")
    .select("id")
    .eq("event_id", session.eventId)
    .eq("staff_id", session.staffId)
    .eq("action", "event_checkin")
    .eq("status", "success")
    .gte("timestamp", `${today}T00:00:00Z`)
    .lt("timestamp", `${today}T23:59:59Z`);

  if (checkins) stats.checkedIn = checkins.length;

  return NextResponse.json({ stats });
}
