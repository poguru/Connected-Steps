import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { verifyEventQR } from "@/lib/event-qr";

// POST /api/events/check-in
// Body: { token: string }   — the signed QR token
// Auth: admin or coach (x-admin-session or cs_admin_session cookie)
//
// Validates the event QR, confirms the registration is active, and marks
// the attendee as checked-in. Idempotent: scanning the same code twice
// returns success with already_checked_in = true.

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

  // 1. Verify HMAC signature — rejects tampered or unknown tokens
  const decoded = verifyEventQR(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid QR code" }, { status: 400 });
  }

  const { registrationCode, eventId } = decoded;
  const db = getSupabaseServer();

  // 2. Look up the registration
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code, user_name, user_email, status, payment_status, distance_category, checked_in_at, events(title, start_date, location)")
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
      checked_in_at: string | null;
      events: { title: string; start_date: string; location: string } | null;
    }>();

  if (regErr || !reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // 3. Block cancelled/waitlisted registrations
  if (reg.status === "cancelled") {
    return NextResponse.json({ error: "This registration has been cancelled.", valid: false }, { status: 409 });
  }
  if (reg.status !== "confirmed") {
    return NextResponse.json({ error: "Registration is not confirmed yet.", valid: false }, { status: 409 });
  }

  // 4. Idempotent: already checked in
  if (reg.checked_in_at) {
    return NextResponse.json({
      valid:              true,
      already_checked_in: true,
      message:            `${reg.user_name} is already checked in.`,
      registration:       {
        code:     reg.registration_code,
        name:     reg.user_name,
        category: reg.distance_category,
        event:    reg.events?.title ?? "",
        checked_in_at: reg.checked_in_at,
      },
    });
  }

  // 5. Mark as checked in
  const now = new Date().toISOString();
  const { error: updateErr } = await db
    .from("event_registrations")
    .update({ checked_in_at: now })
    .eq("id", reg.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    valid:              true,
    already_checked_in: false,
    message:            `✅ ${reg.user_name} checked in successfully!`,
    registration:       {
      code:     reg.registration_code,
      name:     reg.user_name,
      email:    reg.user_email,
      category: reg.distance_category,
      event:    reg.events?.title ?? "",
      checked_in_at: now,
    },
  });
}
