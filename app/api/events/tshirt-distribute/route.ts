import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getCoachEmailFromCookie } from "@/lib/admin-auth";
import { verifyEventQR } from "@/lib/event-qr";

// POST /api/events/tshirt-distribute
// Body: { token: string, counter_number?: string, remarks?: string }
// Auth: admin or coach (x-admin-session or cs_admin_session cookie)
//
// Marks a t-shirt as issued for the scanned registration.
// Idempotent: scanning the same code twice returns "already issued" with details.

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string; counter_number?: string; remarks?: string; dry_run?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, counter_number, remarks, dry_run = false } = body;
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const decoded = verifyEventQR(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid QR code" }, { status: 400 });
  }

  const { registrationCode, eventId } = decoded;
  const db = getSupabaseServer();

  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code, user_name, user_email, status, payment_status, tshirt_size, tshirt_issued, tshirt_issued_at, tshirt_issued_by, events(title, start_date, location, collect_tshirt)")
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .single<{
      id: string;
      registration_code: string;
      user_name: string;
      user_email: string;
      status: string;
      payment_status: string;
      tshirt_size: string | null;
      tshirt_issued: boolean;
      tshirt_issued_at: string | null;
      tshirt_issued_by: string | null;
      events: { title: string; start_date: string; location: string; collect_tshirt: boolean } | null;
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
  if (!reg.tshirt_size) {
    return NextResponse.json({ error: "No T-shirt size recorded for this participant.", valid: false }, { status: 409 });
  }

  // Dry-run: return participant info without issuing (used for confirmation preview)
  if (dry_run) {
    return NextResponse.json({
      valid:          true,
      preview:        true,
      already_issued: reg.tshirt_issued,
      message:        reg.tshirt_issued
        ? `T-shirt already issued to ${reg.user_name}.`
        : `${reg.tshirt_size} ready for ${reg.user_name}`,
      registration: {
        code:        reg.registration_code,
        name:        reg.user_name,
        tshirt_size: reg.tshirt_size,
        event:       reg.events?.title ?? "",
        issued_at:   reg.tshirt_issued_at,
        issued_by:   reg.tshirt_issued_by,
      },
    });
  }

  // Idempotent: already issued
  if (reg.tshirt_issued) {
    return NextResponse.json({
      valid:           true,
      already_issued:  true,
      message:         `T-shirt already issued to ${reg.user_name}.`,
      registration: {
        code:          reg.registration_code,
        name:          reg.user_name,
        tshirt_size:   reg.tshirt_size,
        event:         reg.events?.title ?? "",
        issued_at:     reg.tshirt_issued_at,
        issued_by:     reg.tshirt_issued_by,
      },
    });
  }

  const now          = new Date().toISOString();
  const volunteerEmail = getCoachEmailFromCookie(req) ?? "admin";

  // Write to audit log first (UNIQUE on registration_id prevents double-issue)
  const { error: distErr } = await db
    .from("event_tshirt_distributions")
    .insert({
      event_id:          eventId,
      registration_id:   reg.id,
      registration_code: registrationCode,
      user_name:         reg.user_name,
      tshirt_size:       reg.tshirt_size,
      volunteer_email:   volunteerEmail,
      volunteer_name:    volunteerEmail,
      counter_number:    counter_number ?? null,
      remarks:           remarks ?? null,
      issued_at:         now,
    });

  if (distErr) {
    // UNIQUE violation means it was just issued concurrently
    if (distErr.code === "23505") {
      return NextResponse.json({
        valid:          true,
        already_issued: true,
        message:        `T-shirt already issued to ${reg.user_name}.`,
      });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Update the registration row
  await db
    .from("event_registrations")
    .update({
      tshirt_issued:    true,
      tshirt_issued_at: now,
      tshirt_issued_by: volunteerEmail,
    })
    .eq("id", reg.id);

  // Mirror to event_participants so live-stats (which reads from participants) stays accurate.
  await db
    .from("event_participants")
    .update({ tshirt_issued: true, tshirt_issued_at: now, tshirt_issued_by: volunteerEmail })
    .eq("registration_id", reg.id)
    .neq("status", "cancelled");

  return NextResponse.json({
    valid:          true,
    already_issued: false,
    message:        `✅ T-shirt issued to ${reg.user_name}!`,
    registration: {
      code:        reg.registration_code,
      name:        reg.user_name,
      tshirt_size: reg.tshirt_size,
      event:       reg.events?.title ?? "",
      issued_at:   now,
      issued_by:   volunteerEmail,
    },
  });
}
