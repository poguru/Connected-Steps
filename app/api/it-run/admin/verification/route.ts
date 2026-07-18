import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

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
// Body: { participantId, status, notes }
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "verification_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { participantId, status, notes } = await req.json() as {
      participantId: string;
      status: "verified" | "rejected" | "need_clarification";
      notes?: string;
    };

    if (!participantId || !status) return NextResponse.json({ error: "participantId and status required" }, { status: 400 });

    const db = getSupabaseServer();

    // Update participant verification status
    await db
      .from("it_run_participants")
      .update({ verification_status: status })
      .eq("id", participantId);

    // Log the verification action
    await db
      .from("it_run_company_verifications")
      .insert({
        participant_id: participantId,
        status,
        reviewer_email: session.email,
        reviewed_at:    new Date().toISOString(),
        notes:          notes ?? null,
      });

    // Notify participant by email if rejected or needs clarification
    if (status === "rejected" || status === "need_clarification") {
      const { data: part } = await db
        .from("it_run_participants")
        .select("email,first_name")
        .eq("id", participantId)
        .single();

      if (part?.email) {
        const { sendEmail } = await import("@/lib/notify");
        const subject = status === "rejected"
          ? "Company ID Verification - Action Required (The IT Run Sprint-2)"
          : "Company ID - Clarification Needed (The IT Run Sprint-2)";
        const body = status === "rejected"
          ? `Hi ${part.first_name}, your company ID could not be verified. Please carry your original company ID to the BIB collection counter for physical verification. ${notes ? `Note from team: ${notes}` : ""}`
          : `Hi ${part.first_name}, we need clarification on your company ID. ${notes ? `Details: ${notes}` : "Please contact info@connectedsteps.in for assistance."}`;

        await sendEmail(part.email, part.first_name, subject, `<p>${body}</p>`, false, true)
          .catch(e => console.error("[it-run/verification] email error:", e));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
