import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, verifyItRunQR, getClientIp } from "@/lib/it-run-auth";

// GET /api/it-run/checkin?q=<qr_token_or_bib_number>
// POST /api/it-run/checkin — record check-in
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "checkin_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Query required" }, { status: 400 });

  const db = getSupabaseServer();

  // Resolve current event — all lookups are scoped to this event
  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Try QR token first
  const qrData = verifyItRunQR(q);
  let participantId = qrData?.participantId;

  // Try BIB number (always scoped to current event to prevent cross-event lookup)
  if (!participantId) {
    const { data: part } = await db
      .from("it_run_participants")
      .select("id")
      .eq("bib_number", q)
      .eq("event_id", event.id)
      .maybeSingle<{ id: string }>();
    participantId = part?.id;
  }

  if (!participantId) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  // Fetch full participant details — scope to current event so a QR token from
  // another event (same HMAC secret, different participant UUID) cannot look up
  // a participant outside this event.
  const { data: part } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, bib_number, wave,
      it_run_registrations!inner ( registration_code, payment_status,
        it_run_categories ( name, distance_km, color )
      ),
      it_run_checkins ( id, checked_in_at )
    `)
    .eq("id", participantId)
    .eq("event_id", event.id)
    .single();

  if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  return NextResponse.json({ participant: part });
}

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "checkin_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { participantId } = await req.json() as { participantId: string };
    if (!participantId) return NextResponse.json({ error: "participantId required" }, { status: 400 });

    const db = getSupabaseServer();

    // Resolve current event — mutations are scoped to this event
    const { data: event } = await db
      .from("it_run_events")
      .select("id")
      .eq("slug", "sprint-2")
      .single<{ id: string }>();
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Verify participant exists, belongs to THIS event, and registration is confirmed
    const { data: part } = await db
      .from("it_run_participants")
      .select("id,first_name,last_name,bib_number,it_run_registrations!inner(payment_status)")
      .eq("id", participantId)
      .eq("event_id", event.id)
      .single<{
        id: string; first_name: string; last_name: string;
        bib_number: string | null;
        it_run_registrations: { payment_status: string };
      }>();

    if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    if (!["paid","free"].includes(part.it_run_registrations.payment_status)) {
      return NextResponse.json({ error: "Registration not confirmed" }, { status: 400 });
    }

    const { error: insErr } = await db
      .from("it_run_checkins")
      .insert({ participant_id: participantId, volunteer_email: session.email });

    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "Already checked in", already: true }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to record check-in" }, { status: 500 });
    }

    // Audit log
    db.from("it_run_audit_logs").insert({
      actor_email: session.email,
      actor_role:  session.role,
      action:      "checkin",
      entity_type: "participant",
      entity_id:   participantId,
      ip:          getClientIp(req),
      detail: {
        participant_name: `${part.first_name} ${part.last_name}`,
        bib_number:       part.bib_number,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({
      ok:   true,
      name: `${part.first_name} ${part.last_name}`,
      bib:  part.bib_number,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
