import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import {
  validateReviewDecision,
  buildCompanyVerificationRejectionEmail,
  buildCompanyVerificationApprovedEmail,
  buildCompanyVerificationClarificationEmail,
} from "@/lib/it-run-verification";
import { buildCompanyIdCorrectionUrl } from "@/lib/it-run-company-id-link";

// GET /api/it-run/admin/verification?status=pending&page=0&limit=50
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "verification_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "pending";
  const page   = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));
  const limit  = Math.min(100, Math.max(10, parseInt(sp.get("limit") ?? "50", 10)));

  const db = getSupabaseServer();

  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Every eligible participant is listed for the chosen status, whether or not a document was uploaded.
  // A document-existence filter here hid participants (for example children, who are verified without a document)
  // and any participant who continued without an ID. "all" lists every status.
  let query = db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile,
      company_name, employee_id, company_id_url, verification_status, id_document_type,
      it_run_registrations ( registration_code, payment_status, registration_status,
        it_run_categories ( name ) )
    `, { count: "exact" })
    .eq("event_id", event.id);
  if (status !== "all") query = query.eq("verification_status", status);
  const { data, count, error } = await query
    .order("id")
    .range(page * limit, page * limit + limit - 1);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ data, total: count ?? 0, page, limit });
}

// PATCH /api/it-run/admin/verification
// Body: { participantId, status, reason?, adminExplanation? }
// reason is mandatory for rejected / need_clarification (see validateReviewDecision).
// Internal reason codes are stored and audited; participants only receive the templated text.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "verification_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    participantId?: string;
    status?: string;
    reason?: unknown;
    adminExplanation?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { participantId, status } = body;
  if (!participantId || !status) {
    return NextResponse.json({ error: "participantId and status required" }, { status: 400 });
  }

  const decision = validateReviewDecision({
    status,
    reason: body.reason,
    adminExplanation: body.adminExplanation,
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: 400 });
  }

  try {
    const db = getSupabaseServer();

    const { data: event } = await db.from("it_run_events").select("id, title, slug").eq("slug", "sprint-2").single();
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { data: part } = await db
      .from("it_run_participants")
      .select("email, first_name, company_id_url, id_document_type")
      .eq("id", participantId)
      .eq("event_id", event.id)
      .maybeSingle<{ email: string | null; first_name: string; company_id_url: string | null; id_document_type: string | null }>();
    if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    // A participant who continued without an ID has nothing to review. Never approve or reject them.
    if (!part.company_id_url) {
      return NextResponse.json({
        error: "No ID document is on file for this participant, so there is nothing to review.",
        code: "NO_DOCUMENT",
      }, { status: 409 });
    }

    const { error: updErr } = await db
      .from("it_run_participants")
      .update({ verification_status: status })
      .eq("id", participantId);

    if (updErr) {
      console.error("[it-run/verification] participant update failed:", updErr.message);
      return NextResponse.json({ error: "Failed to update verification status" }, { status: 500 });
    }

    const { error: logErr } = await db
      .from("it_run_company_verifications")
      .insert({
        participant_id: participantId,
        status,
        verification_reason: decision.reason,
        admin_explanation: decision.explanation,
        reviewer_email: session.email,
        reviewed_at: new Date().toISOString(),
      });
    if (logErr) {
      console.error("[it-run/verification] verification log insert failed:", logErr.message);
    }

    // Correction link is bound to the document currently on file. No document = no correction link to send.
    const correctionUrl = part.company_id_url ? buildCompanyIdCorrectionUrl(participantId, part.company_id_url) : null;

    if (part.email && (status === "verified" || correctionUrl)) {
      const { sendEmail } = await import("@/lib/notify");

      let subject = "";
      let htmlBody = "";

      if (status === "verified") {
        const isGovernment = part.id_document_type === "government";
        subject = isGovernment ? `ID Verified - ${event.title}` : `Company ID Verified - ${event.title}`;
        htmlBody = buildCompanyVerificationApprovedEmail(part.first_name, {
          eventTitle: event.title,
          eventDate: "February 7, 2027",
        }, isGovernment ? "government" : "company");
      } else if (status === "rejected") {
        subject = "Company ID Verification - Action Required (The IT Run Sprint-2)";
        htmlBody = buildCompanyVerificationRejectionEmail(part.first_name, decision.reason!, decision.explanation, {
          eventTitle: event.title,
          bibLocations: [
            { name: "Main BIB Counter", address: "HITEC City, Hyderabad", date: "Feb 4, 2027, 10 AM - 6 PM" },
            { name: "Secondary Counter", address: "Tech Park, Hyderabad", date: "Feb 5, 2027, 10 AM - 4 PM" },
          ],
          correctionUrl: correctionUrl ?? "",
        });
      } else {
        subject = "Company ID - Clarification Needed (The IT Run Sprint-2)";
        htmlBody = buildCompanyVerificationClarificationEmail(
          part.first_name,
          decision.explanation ?? "We need additional information to complete your company ID verification.",
          { eventTitle: event.title, correctionUrl: correctionUrl ?? "" },
        );
      }

      await sendEmail(part.email, part.first_name, subject, htmlBody, false, true)
        .catch(e => console.error("[it-run/verification] email error:", e));
    }

    await db.from("it_run_audit_logs").insert({
      actor_email: session.email,
      actor_role:  session.role,
      action:      `verification_${status}`,
      entity_type: "participant",
      entity_id:   participantId,
      ip:          getClientIp(req),
      detail: {
        status,
        reason: decision.reason,
        admin_explanation: decision.explanation,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
