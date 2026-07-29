import { NextRequest, NextResponse } from "next/server";
import { getOpsSession } from "@/lib/ops-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/ops/lead-scan
// Body: { qr_token: string; notes?: string }
// Requires ops_session with role = 'sponsor'.
// Looks up the participant by qr_token, creates/updates a sponsor_lead, returns participant info.
export async function POST(req: NextRequest) {
  const session = getOpsSession(req);
  if (!session || session.role !== "sponsor") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { qr_token?: string; notes?: string };
  const qrToken = body.qr_token?.trim();
  if (!qrToken) return NextResponse.json({ error: "qr_token is required" }, { status: 400 });

  const db = getSupabaseServer();

  // Resolve participant from qr_token
  const { data: participant, error: pErr } = await db
    .from("event_participants")
    .select("id, first_name, last_name, email, phone, distance_category, qr_token, checked_in_at")
    .eq("qr_token", qrToken)
    .eq("event_id", session.eid)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!participant) return NextResponse.json({ error: "Participant not found for this event", code: "NOT_FOUND" }, { status: 404 });

  // Resolve the sponsor_id linked to this assignment
  const { data: assignment } = await db
    .from("event_portal_assignments")
    .select("id, sponsor_id")
    .eq("id", session.uid.startsWith("asgn_") ? session.uid.slice(5) : session.uid)
    .maybeSingle();

  // Fallback: look up assignment by portal_user_id + event_id + role
  let sponsorId: string | null = assignment?.sponsor_id ?? null;
  let assignmentId: string | null = assignment?.id ?? null;

  if (!assignmentId) {
    const { data: asgn } = await db
      .from("event_portal_assignments")
      .select("id, sponsor_id")
      .eq("portal_user_id", session.uid)
      .eq("event_id", session.eid)
      .eq("role", "sponsor")
      .eq("is_active", true)
      .maybeSingle();
    sponsorId    = asgn?.sponsor_id ?? null;
    assignmentId = asgn?.id ?? null;
  }

  // Upsert the lead (ignore duplicate — already scanned by this sponsor)
  const { data: lead, error: lErr } = await db
    .from("sponsor_leads")
    .upsert({
      event_id:         session.eid,
      event_sponsor_id: sponsorId,
      assignment_id:    assignmentId,
      participant_id:   participant.id,
      first_name:       participant.first_name,
      last_name:        participant.last_name,
      email:            participant.email,
      phone:            participant.phone,
      distance_category: participant.distance_category,
      notes:            body.notes ?? null,
      scanned_at:       new Date().toISOString(),
    }, { onConflict: "event_sponsor_id,participant_id", ignoreDuplicates: false })
    .select("id, scanned_at")
    .maybeSingle();

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    lead_id: lead?.id,
    participant: {
      id:                participant.id,
      first_name:        participant.first_name,
      last_name:         participant.last_name,
      email:             participant.email,
      phone:             participant.phone,
      distance_category: participant.distance_category,
      checked_in:        Boolean(participant.checked_in_at),
    },
  });
}
