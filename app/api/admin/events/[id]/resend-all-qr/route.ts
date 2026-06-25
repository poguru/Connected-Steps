import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";
import QRCode from "qrcode";

// POST /api/admin/events/[id]/resend-all-qr
// Resends QR confirmation email to all confirmed registrants of an event.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const db = getSupabaseServer();

  const { data: regs, error } = await db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, distance_category, events(title, start_date, start_time, location)")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .neq("payment_status", "pending");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!regs?.length) return NextResponse.json({ sent: 0, failed: 0, message: "No confirmed registrations found." });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  let sent = 0, failed = 0;

  type RegRow = {
    id: string; registration_code: string; user_email: string; user_name: string;
    distance_category: string | null;
    events: { title: string; start_date: string; start_time: string | null; location: string } | null;
  };
  for (const reg of (regs as unknown as RegRow[])) {
    try {
      const qrToken   = signEventQR(reg.registration_code, eventId);
      await db.from("event_registrations").update({ qr_token: qrToken }).eq("id", reg.id);

      const qrContent = `${appUrl}/event-checkin?t=${encodeURIComponent(qrToken)}`;
      const qrDataUrl = await QRCode.toDataURL(qrContent, { width: 400, margin: 2 });
      const ev        = reg.events;

      const result = await sendEmail(
        reg.user_email,
        reg.user_name,
        `Your QR Code — ${ev?.title ?? "Connected Steps Event"}`,
        eventRegistrationEmailHTML({
          name:             reg.user_name,
          eventTitle:       ev?.title ?? "Connected Steps Event",
          startDate:        ev?.start_date ?? "",
          startTime:        ev?.start_time ?? null,
          location:         ev?.location   ?? "",
          registrationCode: reg.registration_code,
          distanceCategory: reg.distance_category,
          qrDataUrl,
        }),
      );

      if (result.ok) sent++; else { failed++; console.error(`[resend-all-qr] failed for ${reg.user_email}:`, result.error); }
    } catch (e) {
      failed++;
      console.error(`[resend-all-qr] exception for ${reg.user_email}:`, e);
    }
  }

  return NextResponse.json({ sent, failed, total: regs.length });
}
