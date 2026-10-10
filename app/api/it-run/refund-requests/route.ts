import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { participantChangesOpen, participantChangesClosedBody } from "@/lib/it-run-participant-cutoff";

// Participant refund requests.
// A request is ONLY a request. Creating one never calls Razorpay, never cancels the
// registration and never releases capacity. An admin must approve and execute it.

const MIN_REASON = 10;
const MAX_REASON = 1000;

// GET /api/it-run/refund-requests
// Lists the caller's own refund requests (ownership via linked_user_email).
export async function GET(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("it_run_refund_requests")
    .select(`
      id, status, request_reason, decision_explanation, decided_at, created_at,
      it_run_registrations!inner ( registration_code, linked_user_email ),
      it_run_refunds ( status, amount_paise, razorpay_refund_id, processed_at, failure_reason )
    `)
    .eq("it_run_registrations.linked_user_email", userEmail)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[it-run/refund-requests] query error:", error.message);
    return NextResponse.json({ error: "Failed to load refund requests" }, { status: 500 });
  }

  // Return only participant-safe fields (no reviewer emails, IPs or internal metadata).
  type Row = {
    id: string; status: string; request_reason: string; decision_explanation: string | null;
    decided_at: string | null; created_at: string;
    it_run_registrations: { registration_code: string } | null;
    it_run_refunds: { status: string; amount_paise: number; razorpay_refund_id: string | null; processed_at: string | null } | null;
  };
  const requests = ((data ?? []) as unknown as Row[]).map(r => ({
    id: r.id,
    status: r.status,
    registration_code: r.it_run_registrations?.registration_code ?? null,
    request_reason: r.request_reason,
    admin_response: r.decision_explanation,
    decided_at: r.decided_at,
    created_at: r.created_at,
    refund: r.it_run_refunds
      ? {
          status: r.it_run_refunds.status,
          amount_paise: r.it_run_refunds.amount_paise,
          reference: r.it_run_refunds.razorpay_refund_id,
          processed_at: r.it_run_refunds.processed_at,
        }
      : null,
  }));

  return NextResponse.json({ requests });
}

// POST /api/it-run/refund-requests
// Body: { registration_code, reason }
export async function POST(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Closed before anything is read or written. Existing requests stay visible (GET) and admins still process them.
  if (!participantChangesOpen()) {
    return NextResponse.json(participantChangesClosedBody(), { status: 403 });
  }

  let body: { registration_code?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code   = typeof body.registration_code === "string" ? body.registration_code.trim().toUpperCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!code) return NextResponse.json({ error: "Registration code is required" }, { status: 400 });
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return NextResponse.json({ error: `Please describe the reason in ${MIN_REASON}-${MAX_REASON} characters` }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Ownership: the registration must be linked to the signed-in user. Same response for
  // "not found" and "not yours" so codes cannot be enumerated.
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, event_id, registration_code, payment_status, registration_status, final_price")
    .eq("registration_code", code)
    .eq("linked_user_email", userEmail)
    .maybeSingle<{
      id: string; event_id: string; registration_code: string;
      payment_status: string; registration_status: string; final_price: number;
    }>();
  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  if (reg.final_price <= 0 || reg.payment_status === "free") {
    return NextResponse.json({ error: "Free registrations are not eligible for a refund" }, { status: 422 });
  }
  if (reg.payment_status === "refunded") {
    return NextResponse.json({ error: "This registration has already been refunded" }, { status: 422 });
  }
  if (!["paid", "partially_refunded"].includes(reg.payment_status)) {
    return NextResponse.json({ error: "No captured payment is available for a refund on this registration" }, { status: 422 });
  }
  if (reg.registration_status === "cancelled") {
    return NextResponse.json({ error: "This registration is already cancelled" }, { status: 422 });
  }

  // The partial unique index allows only one open request per registration.
  const { data: created, error: insErr } = await db
    .from("it_run_refund_requests")
    .insert({
      event_id: reg.event_id,
      registration_id: reg.id,
      requested_by_email: userEmail,
      request_reason: reason,
      status: "requested",
    })
    .select("id, status, created_at")
    .maybeSingle<{ id: string; status: string; created_at: string }>();

  if (insErr?.code === "23505") {
    return NextResponse.json({ error: "A refund request is already open for this registration" }, { status: 409 });
  }
  if (insErr || !created) {
    console.error("[it-run/refund-requests] insert failed:", insErr?.message);
    return NextResponse.json({ error: "Failed to submit refund request" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    request: { id: created.id, status: created.status, registration_code: reg.registration_code, created_at: created.created_at },
    message: "Your refund request has been submitted for review. No refund has been issued yet.",
  }, { status: 201 });
}
