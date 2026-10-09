import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import {
  VerificationReason,
  REJECTION_REASON_LABELS,
  buildCompanyVerificationRejectionEmail,
  buildCompanyVerificationApprovedEmail,
  buildCompanyVerificationClarificationEmail,
} from "@/lib/it-run-verification";

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

  const { data, count, error } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile,
      company_name, employee_id, company_id_url, verification_status,
      it_run_registrations!inner ( registration_code, payment_status,
        it_run_categories ( name ) )
    `, { count: "exact" })
    .eq("event_id", event.id)
    .eq("verification_status", status)
    .not("company_id_url", "is", null)
    .order("id")
    .range(page * limit, page * limit + limit - 1);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ data, total: count ?? 0, page, limit });
}

// PATCH /api/it-run/admin/verification
// Body: { participantId, status, reason, adminExplanation }
// reason (required for rejected/need_clarification): one of the VerificationReason codes
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "verification_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { participantId, status, reason, adminExplanation } = await req.json() as {
      participantId: string;
      status: "verified" | "rejected" | "need_clarification";
      reason?: VerificationReason;
      adminExplanation?: string;
    };

    if (!participantId || !status) {
      return NextResponse.json({ error: "participantId and status required" }, { status: 400 });
    }

    // For rejected and need_clarification, reason is mandatory
    if ((status === "rejected" || status === "need_clarification") && !reason) {
      return NextResponse.json({
        error: `reason is required when status is ${status}. Valid reasons: ${Object.keys(REJECTION_REASON_LABELS).join(", ")}`
      }, { status: 400 });
    }

    // Validate reason code if provided
    if (reason && !Object.keys(REJECTION_REASON_LABELS).includes(reason)) {
      return NextResponse.json({ error: `Invalid reason: ${reason}` }, { status: 400 });
    }

    // Validate adminExplanation length if provided
    if (adminExplanation && adminExplanation.length > 1000) {
      return NextResponse.json({ error: "Admin explanation cannot exceed 1000 characters" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Update participant verification status
    const { error: updErr } = await db
      .from("it_run_participants")
      .update({ verification_status: status })
      .eq("id", participantId);

    if (updErr) {
      console.error("[it-run/verification] participant update failed:", updErr.message);
      return NextResponse.json({ error: "Failed to update verification status" }, { status: 500 });
    }

    // Log the verification action with structured reason
    await db
      .from("it_run_company_verifications")
      .insert({
        participant_id: participantId,
        status,
        verification_reason: reason ?? null,
        admin_explanation: adminExplanation ?? null,
        reviewer_email: session.email,
        reviewed_at: new Date().toISOString(),
      });

    // Fetch event details and participant info for email
    const { data: event } = await db.from("it_run_events").select("id, title, slug").eq("slug", "sprint-2").single();
    const { data: part } = await db
      .from("it_run_participants")
      .select("email, first_name")
      .eq("id", participantId)
      .single();

    if (part?.email && event) {
      const { sendEmail } = await import("@/lib/notify");

      let subject = "";
      let htmlBody = "";

      if (status === "verified") {
        subject = `Company ID Verified - ${event.title}`;
        htmlBody = buildCompanyVerificationApprovedEmail(part.first_name, {
          eventTitle: event.title,
          eventDate: "August 15-16, 2026",
        });
      } else if (status === "rejected") {
        subject = "Company ID Verification - Action Required (The IT Run Sprint-2)";
        htmlBody = buildCompanyVerificationRejectionEmail(part.first_name, reason!, adminExplanation ?? null, {
          eventTitle: event.title,
          bibLocations: [
            { name: "Main BIB Counter", address: "HITEC City, Hyderabad", date: "Aug 15, 10 AM - 6 PM" },
            { name: "Secondary Counter", address: "Tech Park, Hyderabad", date: "Aug 16, 10 AM - 4 PM" },
          ],
        });
      } else if (status === "need_clarification") {
        subject = "Company ID - Clarification Needed (The IT Run Sprint-2)";
        htmlBody = buildCompanyVerificationClarificationEmail(
          part.first_name,
          adminExplanation || "We need additional information to complete your company ID verification. Please contact us with more details.",
          { eventTitle: event.title },
        );
      }

      await sendEmail(part.email, part.first_name, subject, htmlBody, false, true)
        .catch(e => console.error("[it-run/verification] email error:", e));
    }

    // Audit log
    db.from("it_run_audit_logs").insert({
      actor_email: session.email,
      actor_role:  session.role,
      action:      `verification_${status}`,
      entity_type: "participant",
      entity_id:   participantId,
      ip:          getClientIp(req),
      detail: {
        status,
        reason: reason ?? null,
        admin_explanation: adminExplanation ?? null,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
