import { NextRequest, NextResponse } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

type Params = { params: Promise<{ id: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/events/[id]/teams
// Returns teams with members and leaderboard scores.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const { data: teams, error } = await db
    .from("event_corporate_teams")
    .select(`
      id, company_name, team_name, hr_contact_name, hr_contact_email, notes, created_at,
      event_team_members (
        id, role,
        event_participants (
          id, first_name, last_name, email, phone, distance_category,
          registration_code, checked_in, bib_collected, tshirt_issued, medal_issued
        )
      )
    `)
    .eq("event_id", eventId)
    .order("team_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type ParticipantRow = { id: string; first_name: string; last_name: string; email: string; phone: string | null; distance_category: string | null; registration_code: string | null; checked_in: boolean; bib_collected: boolean; tshirt_issued: boolean; medal_issued: boolean; bib_number: string | null };

  // Compute leaderboard scores per team
  const leaderboard = (teams ?? []).map(t => {
    const members = (t.event_team_members ?? [])
      .map(m => (Array.isArray(m.event_participants) ? m.event_participants[0] : m.event_participants) as ParticipantRow | null)
      .filter((p): p is ParticipantRow => p !== null);
    const registered = members.length;
    const checkedIn  = members.filter(p => p.checked_in).length;
    const finishers  = members.filter(p => p.medal_issued).length;
    // Score: 1 pt per registered, 2 pts per checked-in, 3 pts per finisher
    const score = registered + checkedIn * 2 + finishers * 3;
    return { ...t, members_count: registered, checked_in: checkedIn, finishers, score };
  }).sort((a, b) => b.score - a.score);

  return NextResponse.json({ teams: leaderboard });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/events/[id]/teams
// Body: { company_name, team_name, hr_contact_name?, hr_contact_email?, notes? }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as {
    company_name?: string; team_name?: string;
    hr_contact_name?: string; hr_contact_email?: string; notes?: string;
  };

  if (!body.company_name?.trim() || !body.team_name?.trim())
    return NextResponse.json({ error: "company_name and team_name are required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_corporate_teams")
    .insert({
      event_id:         eventId,
      company_name:     body.company_name.trim(),
      team_name:        body.team_name.trim(),
      hr_contact_name:  body.hr_contact_name?.trim() || null,
      hr_contact_email: body.hr_contact_email?.trim() || null,
      notes:            body.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data }, { status: 201 });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/events/[id]/teams
// Body: { action: "assign"|"remove"|"update_team", ... }
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as {
    action?: string;
    team_id?: string;
    participant_id?: string;
    registration_code?: string;
    role?: string;
    // for update_team
    id?: string;
    company_name?: string;
    team_name?: string;
    hr_contact_name?: string;
    hr_contact_email?: string;
    notes?: string;
  };

  const db = getSupabaseServer();

  if (body.action === "assign") {
    // Resolve participant_id from registration_code if not directly provided
    let participantId = body.participant_id;
    if (!participantId && body.registration_code) {
      const { data: p } = await db
        .from("event_participants")
        .select("id")
        .eq("event_id", eventId)
        .eq("registration_code", body.registration_code.trim().toUpperCase())
        .maybeSingle();
      if (!p) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
      participantId = p.id as string;
    }
    if (!body.team_id || !participantId)
      return NextResponse.json({ error: "team_id and participant_id or registration_code required" }, { status: 400 });

    const { data, error } = await db
      .from("event_team_members")
      .upsert({ team_id: body.team_id, participant_id: participantId, role: body.role ?? "member" },
               { onConflict: "team_id,participant_id" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ member: data });
  }

  if (body.action === "remove") {
    if (!body.team_id || !body.participant_id)
      return NextResponse.json({ error: "team_id and participant_id required" }, { status: 400 });
    const { error } = await db
      .from("event_team_members")
      .delete()
      .eq("team_id", body.team_id)
      .eq("participant_id", body.participant_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "update_team") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const update: Record<string, string | null> = {};
    if (body.company_name) update.company_name = body.company_name.trim();
    if (body.team_name)    update.team_name    = body.team_name.trim();
    if ("hr_contact_name"  in body) update.hr_contact_name  = body.hr_contact_name?.trim() || null;
    if ("hr_contact_email" in body) update.hr_contact_email = body.hr_contact_email?.trim() || null;
    if ("notes"            in body) update.notes            = body.notes?.trim() || null;
    const { data, error } = await db
      .from("event_corporate_teams")
      .update(update)
      .eq("id", body.id)
      .eq("event_id", eventId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ team: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/events/[id]/teams
// Body: { id: team_id }
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_corporate_teams")
    .delete()
    .eq("id", body.id)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
