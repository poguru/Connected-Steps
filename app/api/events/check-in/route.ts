import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getCoachEmailFromCookie } from "@/lib/admin-auth";
import { verifyEventQR } from "@/lib/event-qr";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatch";
import { evaluateAutomations } from "@/lib/automation-engine";

// POST /api/events/check-in
// Body: { token: string }   — the signed QR token
// Auth: admin or coach (cs_admin_session cookie or x-coach-token header)
//
// Lookup order:
//   1. event_participants.qr_token = token  (new participant-based QRs)
//   2. event_registrations.registration_code = decoded.registrationCode  (legacy single-reg QRs)
//
// For participant rows: updates event_participants.checked_in_at
// For legacy rows:      updates event_registrations.checked_in_at (backward compat)
// Both paths are idempotent.

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token } = body;
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const decoded = verifyEventQR(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid QR code" }, { status: 400 });
  }

  const { registrationCode, eventId } = decoded;
  const db         = getSupabaseServer();
  const now        = new Date().toISOString();
  const scannerBy  = getCoachEmailFromCookie(req) ?? "admin";

  // ── Path 1: participant-based QR (new model) ────────────────────────────────
  const { data: participant } = await db
    .from("event_participants")
    .select(`
      id, registration_id, first_name, last_name,
      distance_category, tshirt_size, bib_number,
      checked_in_at, checked_in_by, status, event_id,
      events ( title ),
      event_registrations ( registration_code )
    `)
    .eq("qr_token", token)
    .eq("event_id", eventId)
    .maybeSingle<{
      id: string; registration_id: string; first_name: string; last_name: string | null;
      distance_category: string | null; tshirt_size: string | null; bib_number: string | null;
      checked_in_at: string | null; checked_in_by: string | null; status: string; event_id: string;
      events: { title: string } | null;
      event_registrations: { registration_code: string } | null;
    }>();

  if (participant) {
    if (participant.status === "cancelled") {
      return NextResponse.json({ error: "This registration has been cancelled.", valid: false }, { status: 409 });
    }
    if (participant.status === "pending_payment") {
      return NextResponse.json({ error: "Payment not completed yet.", valid: false }, { status: 409 });
    }

    const name = [participant.first_name, participant.last_name].filter(Boolean).join(" ");
    const regCard = {
      code:        participant.event_registrations?.registration_code ?? "",
      name,
      category:    participant.distance_category,
      tshirt_size: participant.tshirt_size,
      bib_number:  participant.bib_number,
      event:       participant.events?.title ?? "",
    };

    if (participant.checked_in_at) {
      return NextResponse.json({
        valid:              true,
        already_checked_in: true,
        message:            `${name} is already checked in.`,
        registration:       { ...regCard, checked_in_at: participant.checked_in_at },
      });
    }

    const { error } = await db
      .from("event_participants")
      .update({ checked_in_at: now, checked_in_by: scannerBy })
      .eq("id", participant.id);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    // Fire webhooks + automations after successful check-in (fire-and-forget)
    const { data: eventOrg } = await db.from("events").select("organization_id").eq("id", eventId).single<{ organization_id: string }>();
    if (eventOrg?.organization_id) {
      const whCtx = { participant_id: participant.id, event_id: eventId, user_name: name, registration_id: participant.registration_id };
      dispatchWebhookEvent(eventOrg.organization_id, "participant.checked_in", whCtx).catch(() => {});
      evaluateAutomations(eventOrg.organization_id, "participant.checked_in", whCtx).catch(() => {});
    }

    return NextResponse.json({
      valid:              true,
      already_checked_in: false,
      message:            `✅ ${name} checked in!`,
      registration:       { ...regCard, checked_in_at: now },
    });
  }

  // ── Path 2: legacy QR (registration_code embedded directly) ─────────────────
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code, user_name, user_email, status, payment_status, distance_category, tshirt_size, checked_in_at, events(title, start_date, location)")
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .single<{
      id: string;
      registration_code: string;
      user_name: string;
      user_email: string;
      status: string;
      payment_status: string;
      distance_category: string | null;
      tshirt_size: string | null;
      checked_in_at: string | null;
      events: { title: string; start_date: string; location: string } | null;
    }>();

  if (regErr || !reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  if (reg.status === "cancelled") {
    return NextResponse.json({ error: "This registration has been cancelled.", valid: false }, { status: 409 });
  }
  if (reg.status !== "confirmed") {
    return NextResponse.json({ error: "Registration is not confirmed yet.", valid: false }, { status: 409 });
  }

  if (reg.checked_in_at) {
    return NextResponse.json({
      valid:              true,
      already_checked_in: true,
      message:            `${reg.user_name} is already checked in.`,
      registration: {
        code:        reg.registration_code,
        name:        reg.user_name,
        category:    reg.distance_category,
        tshirt_size: reg.tshirt_size,
        event:       reg.events?.title ?? "",
        checked_in_at: reg.checked_in_at,
      },
    });
  }

  const { error: updateErr } = await db
    .from("event_registrations")
    .update({ checked_in_at: now, checked_in_by: scannerBy })
    .eq("id", reg.id);
  if (updateErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({
    valid:              true,
    already_checked_in: false,
    message:            `✅ ${reg.user_name} checked in successfully!`,
    registration: {
      code:        reg.registration_code,
      name:        reg.user_name,
      email:       reg.user_email,
      category:    reg.distance_category,
      tshirt_size: reg.tshirt_size,
      event:       reg.events?.title ?? "",
      checked_in_at: now,
    },
  });
}
