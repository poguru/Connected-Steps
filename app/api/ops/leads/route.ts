import { NextRequest, NextResponse } from "next/server";
import { getOpsSession } from "@/lib/ops-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/ops/leads
// Returns all sponsor_leads captured by the current sponsor user during this event.
// Requires ops_session with role = 'sponsor'.
export async function GET(req: NextRequest) {
  const session = getOpsSession(req);
  if (!session || session.role !== "sponsor") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Find this volunteer's assignment to get sponsor_id
  const { data: asgn } = await db
    .from("event_portal_assignments")
    .select("id, sponsor_id, event_sponsors(name, tier)")
    .eq("portal_user_id", session.uid)
    .eq("event_id", session.eid)
    .eq("role", "sponsor")
    .eq("is_active", true)
    .maybeSingle();

  const sponsorId = asgn?.sponsor_id ?? null;

  const query = db
    .from("sponsor_leads")
    .select("id, first_name, last_name, email, phone, distance_category, notes, scanned_at")
    .eq("event_id", session.eid)
    .order("scanned_at", { ascending: false });

  if (sponsorId) query.eq("event_sponsor_id", sponsorId);
  else query.eq("assignment_id", asgn?.id ?? "00000000-0000-0000-0000-000000000000");

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    leads: leads ?? [],
    sponsor: asgn?.sponsor_id
      ? { id: asgn.sponsor_id, name: (asgn.event_sponsors as unknown as { name: string } | null)?.name, tier: (asgn.event_sponsors as unknown as { tier: string } | null)?.tier }
      : null,
  });
}
