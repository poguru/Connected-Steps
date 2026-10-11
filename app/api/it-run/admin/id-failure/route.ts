import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { getRefundedAmountPaise, paidAmountPaise } from "@/lib/it-run-refunds";
import { idFailureRefundPaise, ID_FAILURE_STAGES, type IdFailureStage } from "@/lib/it-run-id-failure";

// POST /api/it-run/admin/id-failure
// An admin records that a participant's ID could not be verified. This opens a refund REQUEST of kind 'id_failure'
// with the amount the rules give. Nothing is refunded here. The request is approved on the refund requests page, and
// the refund is then executed with an explicit confirmation, exactly like any other refund.
//
// Body: { registration_id, participant_id, stage: "verification" | "bib_collection", reason }
//   verification  company ID rejected (after any clarification): 96% refunded
//   bib_collection government ID, IT employment not verified on collection day: 80% refunded
//
// Roles: event_admin.
const MIN_REASON = 10;
const MAX_REASON = 1000;

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { registration_id?: unknown; participant_id?: unknown; stage?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const registrationId = typeof body.registration_id === "string" ? body.registration_id : "";
  const participantId = typeof body.participant_id === "string" ? body.participant_id : "";
  const stage = body.stage;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!registrationId || !participantId) {
    return NextResponse.json({ error: "registration_id and participant_id are required" }, { status: 400 });
  }
  if (typeof stage !== "string" || !(ID_FAILURE_STAGES as readonly string[]).includes(stage)) {
    return NextResponse.json({ error: "stage must be 'verification' or 'bib_collection'" }, { status: 400 });
  }
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return NextResponse.json({ error: `A reason of ${MIN_REASON}-${MAX_REASON} characters is required` }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, event_id, payment_status, registration_status, final_price, amount_paid_paise, participant_count")
    .eq("id", registrationId)
    .eq("event_id", event.id)
    .maybeSingle<{
      id: string; event_id: string; payment_status: string; registration_status: string;
      final_price: number; amount_paid_paise: number | null; participant_count: number;
    }>();
  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  if (reg.registration_status === "cancelled") {
    return NextResponse.json({ error: "This registration is already cancelled." }, { status: 409 });
  }
  if (!["paid", "partially_refunded"].includes(reg.payment_status) || reg.final_price <= 0) {
    return NextResponse.json({ error: "Only a paid registration can be refunded for an ID failure." }, { status: 422 });
  }

  const { data: part } = await db
    .from("it_run_participants")
    .select("id, registration_id, verification_status, id_document_type")
    .eq("id", participantId)
    .eq("registration_id", reg.id)
    .maybeSingle<{ id: string; registration_id: string; verification_status: string; id_document_type: string | null }>();
  if (!part) return NextResponse.json({ error: "Participant not found on this registration" }, { status: 404 });

  // A company ID refund needs a rejected document (after any clarification). A government ID refund is recorded on
  // collection day, when the employment check fails, so the status is not required to be 'rejected' for it.
  if (stage === "verification" && part.verification_status !== "rejected") {
    return NextResponse.json({
      error: "Record a company ID failure only after the document has been rejected.",
      code: "NOT_REJECTED",
    }, { status: 409 });
  }

  const paid = paidAmountPaise(reg);
  const rule = idFailureRefundPaise(paid, part.id_document_type, stage as IdFailureStage);
  if (!rule.ok) return NextResponse.json({ error: rule.message, code: "NO_RULE" }, { status: 422 });

  let refunded: number;
  try {
    refunded = await getRefundedAmountPaise(db, reg.id);
  } catch {
    return NextResponse.json({ error: "Failed to check existing refunds" }, { status: 500 });
  }
  if (refunded > 0) {
    return NextResponse.json({
      error: "This registration already has a refund. Handle it from the refund page.",
      code: "ALREADY_REFUNDED",
    }, { status: 409 });
  }

  const { data: created, error: insErr } = await db
    .from("it_run_refund_requests")
    .insert({
      event_id: reg.event_id,
      registration_id: reg.id,
      requested_by_email: session.email,
      request_reason: reason,
      status: "requested",
      request_kind: "id_failure",
      requested_amount_paise: rule.refundPaise,
      target_category_id: null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insErr?.code === "23505") {
    return NextResponse.json({ error: "A refund request is already open for this registration." }, { status: 409 });
  }
  if (insErr || !created) {
    console.error("[it-run/admin/id-failure] insert failed:", insErr?.code ?? "unknown");
    return NextResponse.json({ error: "Could not record the ID failure." }, { status: 500 });
  }

  await db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role: session.role,
    action: "id_failure_refund_requested",
    entity_type: "refund_request",
    entity_id: created.id,
    ip: getClientIp(req),
    // The document path and ID number are never written to the audit trail
    detail: {
      registration_id: reg.id,
      participant_id: part.id,
      stage,
      document_type: part.id_document_type,
      refund_paise: rule.refundPaise,
      retained_paise: rule.retainedPaise,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    requestId: created.id,
    refundPaise: rule.refundPaise,
    retainedPaise: rule.retainedPaise,
    status: "requested",
  });
}
