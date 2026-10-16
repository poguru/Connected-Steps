import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { confirmIfVerified, sendConfirmedNotices } from "@/lib/it-run-confirmation";
import { runAfterResponse } from "@/lib/after-response";

// POST /api/it-run/bib-desk/verify-company
// Body: { participantId, expectedVersion }
// At the BIB desk, a runner's company ID was checked physically and is valid: record Company ID Verified.
// The review is made on a version of the record, so a change made by someone else is refused, not overwritten.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { participantId?: unknown; expectedVersion?: unknown };
  if (typeof body.participantId !== "string" || body.participantId.length === 0) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }
  if (typeof body.expectedVersion !== "number" || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "Reload the runner before recording this: the record version is missing.", code: "VERSION_REQUIRED" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: part } = await db
    .from("it_run_participants")
    .select("id, registration_id, cancelled_at, participant_type, verification_version")
    .eq("id", body.participantId)
    .eq("event_id", event.id)
    .maybeSingle<{ id: string; registration_id: string; cancelled_at: string | null; participant_type: string; verification_version: number }>();
  if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  if (part.cancelled_at) return NextResponse.json({ error: "This runner's category was cancelled.", code: "RUNNER_CANCELLED" }, { status: 409 });
  if (part.participant_type === "child") {
    return NextResponse.json({ error: "Children are not checked for company ID.", code: "NOT_APPLICABLE" }, { status: 409 });
  }

  const { data: updated, error: updErr } = await db
    .from("it_run_participants")
    .update({
      verification_status: "verified",
      verification_outcome: "company_verified",
      verification_version: part.verification_version + 1,
    })
    .eq("id", part.id)
    .eq("verification_version", body.expectedVersion)
    .select("id");
  if (updErr) return NextResponse.json({ error: "Could not record the verification" }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json({
      error: "This runner's record was changed by someone else. Reload and check again.",
      code: "VERSION_CONFLICT",
    }, { status: 409 });
  }

  const { error: logErr } = await db.from("it_run_company_verifications").insert({
    participant_id: part.id,
    status: "verified",
    verification_reason: null,
    admin_explanation: "Checked physically at the BIB collection desk",
    reviewer_email: session.email,
    reviewed_at: new Date().toISOString(),
  });
  if (logErr) console.error("[it-run/bib-desk] verification log insert failed:", logErr.message);

  db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "company_verified_at_desk", entity_type: "participant", entity_id: part.id,
    ip: getClientIp(req), detail: { outcome: "company_verified" },
  }).then(() => {}, () => {});

  // If this was the last adult the registration was waiting for, it is confirmed now, as an online verification would do
  const outcome = await confirmIfVerified(db, part.registration_id);
  if (outcome === "confirmed") runAfterResponse("confirmed_notice", () => sendConfirmedNotices(part.registration_id));

  return NextResponse.json({ ok: true, outcome: "company_verified" });
}
