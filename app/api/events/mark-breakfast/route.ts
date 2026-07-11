import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getCoachEmailFromCookie } from "@/lib/admin-auth";
import { verifyEventQR } from "@/lib/event-qr";

// POST /api/events/mark-breakfast
// Body: { token: string, event_id: string }
// Marks a participant's breakfast as availed using the same QR code as check-in.
// Each QR can only claim breakfast once — attempting again returns already_availed.
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string; event_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, event_id } = body;
  if (!token)    return NextResponse.json({ error: "QR token is required" }, { status: 400 });
  if (!event_id) return NextResponse.json({ error: "event_id is required" }, { status: 400 });

  // 1. Verify QR signature
  const decoded = verifyEventQR(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid QR code", valid: false }, { status: 400 });
  }

  const { registrationCode, eventId: tokenEventId } = decoded;

  // 2. Verify QR belongs to this event
  if (tokenEventId !== event_id) {
    return NextResponse.json({ error: "This QR code belongs to a different event.", valid: false, code: "WRONG_EVENT" }, { status: 400 });
  }

  const db          = getSupabaseServer();
  const adminEmail  = getCoachEmailFromCookie(req) ?? "admin";

  // 3. Fetch registration
  const { data: reg } = await db
    .from("event_registrations")
    .select("id, registration_code, user_name, user_email, status, checked_in_at, breakfast_availed, breakfast_availed_at, breakfast_verified_by, events(title)")
    .eq("registration_code", registrationCode)
    .eq("event_id", event_id)
    .single<{
      id: string; registration_code: string; user_name: string; user_email: string;
      status: string; checked_in_at: string | null;
      breakfast_availed: boolean; breakfast_availed_at: string | null; breakfast_verified_by: string | null;
      events: { title: string } | null;
    }>();

  if (!reg) return NextResponse.json({ error: "Registration not found", valid: false }, { status: 404 });

  // 4. Must be confirmed (checked-in not strictly required, but recommended)
  if (reg.status === "cancelled") {
    return NextResponse.json({ error: "This registration has been cancelled.", valid: false }, { status: 409 });
  }
  if (reg.status !== "confirmed") {
    return NextResponse.json({ error: "Registration is not confirmed.", valid: false }, { status: 409 });
  }

  // 5. Check if breakfast already availed
  if (reg.breakfast_availed) {
    return NextResponse.json({
      valid:            true,
      already_availed:  true,
      message:          `Breakfast already availed by ${reg.user_name}.`,
      registration: {
        code:                 reg.registration_code,
        name:                 reg.user_name,
        event:                reg.events?.title ?? "",
        breakfast_availed_at: reg.breakfast_availed_at,
        breakfast_verified_by: reg.breakfast_verified_by,
      },
    });
  }

  // 6. Mark breakfast as availed
  const now = new Date().toISOString();
  const { error: updateErr } = await db
    .from("event_registrations")
    .update({
      breakfast_availed:      true,
      breakfast_availed_at:   now,
      breakfast_verified_by:  adminEmail,
    })
    .eq("id", reg.id);

  if (updateErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  console.log(`[breakfast] ✅ issued to=${reg.user_name} (${reg.registration_code}) by=${adminEmail}`);

  return NextResponse.json({
    valid:           true,
    already_availed: false,
    message:         `✅ Breakfast issued to ${reg.user_name}!`,
    registration: {
      code:                  reg.registration_code,
      name:                  reg.user_name,
      event:                 reg.events?.title ?? "",
      breakfast_availed_at:  now,
      breakfast_verified_by: adminEmail,
    },
  });
}
