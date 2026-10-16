import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { cancelRunnerCategory, NO_BIB_REFUND_PERCENT } from "@/lib/it-run-category-cancel";

// POST /api/it-run/admin/bib-desk/no-bib-cancel
// Body: { participantId, reason }
// A runner whose identity could not be verified at the BIB centre and who chooses to proceed without a BIB. Their
// category is cancelled and 50% of their paid share is requested as a refund (approved on the refund page, as usual).
// Refused once a BIB has been collected, and for a runner whose ID is already verified.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { participantId?: unknown; reason?: unknown };
  if (typeof body.participantId !== "string" || body.participantId.length === 0) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 10) {
    return NextResponse.json({ error: "Record the reason (at least 10 characters) for the audit trail." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: part } = await db
    .from("it_run_participants")
    .select("id, first_name, cancelled_at, verification_status")
    .eq("id", body.participantId)
    .eq("event_id", event.id)
    .maybeSingle<{ id: string; first_name: string; cancelled_at: string | null; verification_status: string }>();
  if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  if (part.cancelled_at) {
    return NextResponse.json({ error: "This runner's category is already cancelled.", code: "ALREADY_CANCELLED" }, { status: 409 });
  }
  if (part.verification_status === "verified") {
    return NextResponse.json({
      error: "This runner's ID is already verified. This cancellation applies only to a runner who could not be verified.",
      code: "ALREADY_VERIFIED",
    }, { status: 409 });
  }

  // Once a BIB is collected, the runner is not eligible for this route
  const { data: collected } = await db
    .from("it_run_bib_collections")
    .select("id")
    .eq("participant_id", part.id)
    .maybeSingle<{ id: string }>();
  if (collected) {
    return NextResponse.json({ error: "A BIB was already collected for this runner, so they cannot cancel this way.", code: "BIB_COLLECTED" }, { status: 409 });
  }

  const result = await cancelRunnerCategory(db, {
    participantId: part.id,
    reason,
    actorEmail: session.email,
    percent: NO_BIB_REFUND_PERCENT,
  });

  if (result.status === "cancelled") {
    db.from("it_run_audit_logs").insert({
      event_id: event.id, actor_email: session.email, actor_role: session.role,
      action: "no_bib_cancellation", entity_type: "participant", entity_id: part.id,
      ip: getClientIp(req), detail: { refund_request_id: result.refundRequestId, refund_paise: result.refundPaise, percent: NO_BIB_REFUND_PERCENT },
    }).then(() => {}, () => {});
    return NextResponse.json({
      ok: true,
      categoryName: result.categoryName,
      runners: result.runners,
      refundPaise: result.refundPaise,
      refundRequestId: result.refundRequestId,
      percent: NO_BIB_REFUND_PERCENT,
    });
  }

  const message =
    result.status === "already_cancelled" ? "This runner's category is already cancelled." :
    result.status === "not_paid" ? "This registration is not paid, so no refund applies. Nothing was cancelled." :
    result.status === "refund_already_open" ? "This booking already has an open refund for this category. Handle it on the refund page." :
    result.status === "error" ? result.message : "Nothing was cancelled.";
  return NextResponse.json({ error: message, code: "NOT_CANCELLED" }, { status: 409 });
}
