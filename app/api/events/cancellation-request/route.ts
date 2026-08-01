import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// POST /api/events/cancellation-request
// Authenticated user submits a cancellation request.
// Does NOT cancel the registration — admin must review and cancel via admin API.
// Body: { registration_code: string, event_id: string, reason: string }

export async function POST(req: NextRequest) {
  // ── Auth: require user session ───────────────────────────────────────────────
  const email = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!email) return NextResponse.json({ error: "Please log in to submit a cancellation request" }, { status: 401 });

  const body = await req.json() as { registration_code?: string; event_id?: string; reason?: string };
  const { registration_code, event_id, reason } = body;

  if (!registration_code || !event_id) return NextResponse.json({ error: "registration_code and event_id are required" }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: "Please provide a reason for cancellation" }, { status: 400 });
  if (reason.trim().length < 10) return NextResponse.json({ error: "Please provide a more detailed reason (at least 10 characters)" }, { status: 400 });

  const db = getSupabaseServer();

  // ── Fetch registration — must belong to requesting user ─────────────────────
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, status, payment_status, events (title, start_date)")
    .eq("registration_code", registration_code)
    .eq("event_id", event_id)
    .single();

  if (regErr || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.user_email.toLowerCase() !== email.toLowerCase()) return NextResponse.json({ error: "Not authorized to request cancellation for this registration" }, { status: 403 });
  if (reg.status === "cancelled") return NextResponse.json({ error: "This registration is already cancelled" }, { status: 409 });

  // ── Check for existing pending request ───────────────────────────────────────
  const { data: existing } = await db
    .from("cancellation_requests")
    .select("id, status")
    .eq("registration_id", reg.id)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      error: existing.status === "pending"
        ? "You already have a pending cancellation request for this registration."
        : "Your cancellation request has already been approved.",
    }, { status: 409 });
  }

  // ── Insert cancellation request ──────────────────────────────────────────────
  const { data: newReq, error: insertErr } = await db
    .from("cancellation_requests")
    .insert({
      registration_id: reg.id,
      event_id,
      user_email:      reg.user_email,
      user_name:       reg.user_name,
      reason:          reason.trim(),
      status:          "pending",
    })
    .select("id, status, requested_at")
    .single();

  if (insertErr) {
    console.error("[cancellation-request] insert error:", insertErr.message);
    return NextResponse.json({ error: "Failed to submit request. Please try again." }, { status: 500 });
  }

  // ── Write audit log ──────────────────────────────────────────────────────────
  void db.from("cancellation_audit_log").insert({
    event_id,
    registration_id:   reg.id,
    registration_code: registration_code,
    action:            "cancel_request_submitted",
    actor:             email,
    actor_type:        "user",
    payload:           { reason: reason.trim(), request_id: newReq.id },
  });

  return NextResponse.json({
    success:     true,
    request_id:  newReq.id,
    status:      "pending",
    message:     "Your cancellation request has been submitted. Our team will review it and contact you within 1–2 business days.",
  });
}
