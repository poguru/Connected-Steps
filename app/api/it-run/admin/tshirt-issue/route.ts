import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// POST /api/it-run/admin/tshirt-issue
// Body: { participantId, counter_name?, confirm? }
//
// First issuance  → INSERT row, return ok.
// Second issuance → 409 { needsConfirm: true } unless confirm:true is sent.
// With confirm:true (event_admin only) → UPDATE existing row with is_override=true.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    participantId?: string; counter_name?: string; confirm?: boolean;
  };
  const { participantId, counter_name, confirm } = body;

  if (!participantId) {
    return NextResponse.json({ error: "participantId required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Verify participant
  const { data: part } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, tshirt_size,
      it_run_registrations!inner ( payment_status, registration_status )
    `)
    .eq("id", participantId)
    .single<{
      id: string; first_name: string; last_name: string; tshirt_size: string | null;
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

  // Check for existing issuance
  const { data: existing } = await db
    .from("it_run_tshirt_issuances")
    .select("id, issued_at, volunteer_email, is_override")
    .eq("participant_id", participantId)
    .maybeSingle<{
      id: string; issued_at: string; volunteer_email: string | null; is_override: boolean;
    }>();

  if (existing && !confirm) {
    // Already issued — require admin confirmation to override
    return NextResponse.json({
      needsConfirm:    true,
      message:         `T-shirt was already issued on ${new Date(existing.issued_at).toLocaleString("en-IN")}${existing.volunteer_email ? ` by ${existing.volunteer_email}` : ""}. An admin can override this.`,
      issued_at:       existing.issued_at,
      issued_by:       existing.volunteer_email,
      is_override:     existing.is_override,
    }, { status: 409 });
  }

  if (existing && confirm) {
    // Override: only event_admin can do this
    if (session.role !== "event_admin") {
      return NextResponse.json({
        error: "Only event_admin can override a t-shirt issuance",
      }, { status: 403 });
    }

    // UPDATE existing row
    const { error: updErr } = await db
      .from("it_run_tshirt_issuances")
      .update({
        volunteer_email: session.email,
        counter_name:    counter_name ?? null,
        issued_at:       new Date().toISOString(),
        is_override:     true,
        override_by:     session.email,
      })
      .eq("participant_id", participantId);

    if (updErr) return NextResponse.json({ error: "Failed to record override" }, { status: 500 });

    // Audit log — override
    db.from("it_run_audit_logs").insert({
      actor_email: session.email,
      actor_role:  session.role,
      action:      "tshirt_override_issued",
      entity_type: "participant",
      entity_id:   participantId,
      detail: {
        participant_name: `${part.first_name} ${part.last_name}`,
        tshirt_size:      part.tshirt_size,
        counter:          counter_name ?? null,
        previous_issued_at: existing.issued_at,
        previous_issued_by: existing.volunteer_email,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({
      ok:       true,
      override: true,
      name:     `${part.first_name} ${part.last_name}`,
      size:     part.tshirt_size,
    });
  }

  // First issuance — INSERT
  const { error: insErr } = await db
    .from("it_run_tshirt_issuances")
    .insert({
      participant_id:  participantId,
      volunteer_email: session.email,
      counter_name:    counter_name ?? null,
    });

  if (insErr) {
    // Race condition (another volunteer just inserted)
    if (insErr.code === "23505") {
      return NextResponse.json({
        needsConfirm: true,
        message:      "T-shirt was just issued by another station. An admin can override if needed.",
        race:         true,
      }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to record issuance" }, { status: 500 });
  }

  // Audit log
  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action:      "tshirt_issued",
    entity_type: "participant",
    entity_id:   participantId,
    detail: {
      participant_name: `${part.first_name} ${part.last_name}`,
      tshirt_size:      part.tshirt_size,
      counter:          counter_name ?? null,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok:   true,
    name: `${part.first_name} ${part.last_name}`,
    size: part.tshirt_size,
  });
}
