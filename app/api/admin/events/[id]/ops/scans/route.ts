import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/ops/scans
// Returns recent scan activity from event_service_logs, enriched with participant name.
// Supports incremental polling via ?since=ISO timestamp.
// Supports search and service filter via query params.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const since   = req.nextUrl.searchParams.get("since") ?? null;
  const service = req.nextUrl.searchParams.get("service") ?? null;
  const limit   = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);

  const db = getSupabaseServer();

  let query = db
    .from("event_service_logs")
    .select(`
      id, service_name, action, volunteer_email, volunteer_role, created_at,
      participant_id,
      event_participants!inner(first_name, last_name, distance_category, bib_number, registration_id,
        event_registrations!inner(registration_code)
      )
    `)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) query = query.gt("created_at", since);
  if (service) query = query.eq("service_name", service);

  const { data, error } = await query;

  if (error) {
    // Fallback: return plain logs without join if participant data is unavailable
    const { data: plain } = await db
      .from("event_service_logs")
      .select("id, service_name, action, volunteer_email, volunteer_role, created_at, participant_id")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(limit);

    return NextResponse.json({
      scans: (plain ?? []).map(l => ({
        id:              l.id,
        participant_id:  l.participant_id,
        participant_name:"—",
        category:        "—",
        bib_number:      null,
        registration_code: null,
        service_name:    l.service_name,
        action:          l.action,
        volunteer_email: l.volunteer_email,
        volunteer_role:  l.volunteer_role,
        created_at:      l.created_at,
      })),
      as_of: new Date().toISOString(),
    });
  }

  type JoinedRow = {
    id: string;
    service_name: string;
    action: string;
    volunteer_email: string | null;
    volunteer_role: string | null;
    created_at: string;
    participant_id: string | null;
    event_participants: {
      first_name: string | null;
      last_name: string | null;
      distance_category: string | null;
      bib_number: string | null;
      registration_id: string;
      event_registrations: { registration_code: string } | null;
    } | null;
  };

  const scans = (data as unknown as JoinedRow[]).map(log => {
    const p = log.event_participants;
    return {
      id:               log.id,
      participant_id:   log.participant_id,
      participant_name: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—" : "—",
      category:         p?.distance_category ?? "—",
      bib_number:       p?.bib_number ?? null,
      registration_code: p?.event_registrations?.registration_code ?? null,
      service_name:     log.service_name,
      action:           log.action,
      volunteer_email:  log.volunteer_email,
      volunteer_role:   log.volunteer_role,
      created_at:       log.created_at,
    };
  });

  return NextResponse.json({ scans, as_of: new Date().toISOString() });
}
