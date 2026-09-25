import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";

// POST /api/it-run/admin/bib-collect
// Body: { participantId, counter_name? }
// Role: event_admin, bib_collection
// Prevents duplicate collection. No override — BIBs are collected once.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { participantId?: string; counter_name?: string };
  const { participantId, counter_name } = body;

  if (!participantId) {
    return NextResponse.json({ error: "participantId required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Resolve current event — all mutations are scoped to this event so a
  // participant from a previous or future event cannot be marked as BIB collected.
  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Verify participant exists, belongs to THIS event, and registration is confirmed
  const { data: part } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, bib_number,
      it_run_registrations!inner ( payment_status, registration_status )
    `)
    .eq("id", participantId)
    .eq("event_id", event.id)
    .single<{
      id: string; first_name: string; last_name: string; bib_number: string | null;
      it_run_registrations: { payment_status: string; registration_status: string };
    }>();

  if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  const { payment_status, registration_status } = part.it_run_registrations;
  if (!["paid", "free"].includes(payment_status)) {
    return NextResponse.json({ error: "Registration payment not confirmed" }, { status: 400 });
  }
  if (registration_status === "cancelled") {
    return NextResponse.json({ error: "Registration is cancelled" }, { status: 400 });
  }

  const { error: insErr } = await db
    .from("it_run_bib_collections")
    .insert({
      participant_id:  participantId,
      volunteer_email: session.email,
      counter_number:  counter_name ?? null,
    });

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json({
        error:            "BIB already collected for this participant",
        already_collected: true,
      }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to record BIB collection" }, { status: 500 });
  }

  // Audit log
  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action:      "bib_collected",
    entity_type: "participant",
    entity_id:   participantId,
    ip:          getClientIp(req),
    detail: {
      participant_name: `${part.first_name} ${part.last_name}`,
      bib_number:       part.bib_number,
      counter:          counter_name ?? null,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok:   true,
    name: `${part.first_name} ${part.last_name}`,
    bib:  part.bib_number,
  });
}
