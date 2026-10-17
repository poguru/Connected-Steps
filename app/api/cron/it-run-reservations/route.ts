import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// Cron: /api/cron/it-run-reservations
// Expires IT Run registrations whose 15-minute payment window has closed, and releases their seats and coupon uses.
// The same rule runs whenever seats are reserved; this job makes it happen on time when nobody is registering.
// Schedule it from an external scheduler (see the report); the job is safe to run as often as needed.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = getSupabaseServer();
    const { data, error } = await db.rpc("itr_expire_stale_registrations", { p_ttl_mins: 15 });
    if (error) {
      console.error("[it-run-reservations] RPC error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, eventsChecked: (data as number | null) ?? 0, ts: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
