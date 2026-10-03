import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, clearStaffSessionCookie, getClientIp } from "@/lib/staff-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/it-run/staff/auth/logout
export async function POST(req: NextRequest) {
  const session = requireStaffRole(req, [
    "super_admin",
    "event_admin",
    "bib_staff",
    "checkin_staff",
    "breakfast_staff",
    "goodies_staff",
    "tshirt_staff",
    "medal_staff",
  ]);

  const db = getSupabaseServer();

  // Log logout
  if (session) {
    db.from("it_run_staff_activity_log")
      .insert({
        event_id: session.eventId,
        staff_id: session.staffId,
        action: "logout",
        status: "success",
        ip_address: getClientIp(req),
        user_agent: req.headers.get("user-agent"),
      })
      .then(() => {}, () => {});
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearStaffSessionCookie());
  return res;
}
