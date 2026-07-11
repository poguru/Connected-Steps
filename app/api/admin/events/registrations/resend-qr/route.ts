import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";

// POST /api/admin/events/registrations/resend-qr
// Body: { registration_id: string }
// Regenerates the QR token and resends the confirmation email.
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { registration_id } = await req.json();
  if (!registration_id) return NextResponse.json({ error: "registration_id required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data: reg } = await db
    .from("event_registrations")
    .select("registration_code, user_email, user_name, event_id, distance_category, status, events(title, start_date, start_time, location)")
    .eq("id", registration_id)
    .single<{
      registration_code: string;
      user_email:        string;
      user_name:         string;
      event_id:          string;
      distance_category: string | null;
      status:            string;
      events:            { title: string; start_date: string; start_time: string | null; location: string } | null;
    }>();

  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.status !== "confirmed") return NextResponse.json({ error: "Registration is not confirmed â€” QR only sent for confirmed registrations" }, { status: 400 });

  try {
    const qrToken   = signEventQR(reg.registration_code, reg.event_id);
    // Update stored QR token
    await db.from("event_registrations").update({ qr_token: qrToken }).eq("id", registration_id);

    const ev     = reg.events;
    const result = await sendEmail(
      reg.user_email,
      reg.user_name,
      `Your Registration & QR Code â€” ${ev?.title ?? "Connected Steps Event"}`,
      eventRegistrationEmailHTML({
        name:             reg.user_name,
        eventTitle:       ev?.title ?? "Connected Steps Event",
        startDate:        ev?.start_date ?? "",
        startTime:        ev?.start_time ?? null,
        location:         ev?.location   ?? "",
        registrationCode: reg.registration_code,
        distanceCategory: reg.distance_category,
        qrToken,
      }),
      false, true, // isOtp=false, isTransactional=true
    );

    if (!result.ok) return NextResponse.json({ error: `Email failed: ${result.error}` }, { status: 500 });
    return NextResponse.json({ ok: true, message: `QR resent to ${reg.user_email}` });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
