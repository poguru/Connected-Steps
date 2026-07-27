import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";

type Params = { params: Promise<{ code: string }> };

// POST /api/my-events/[code]/resend-qr
// Resends the QR confirmation email to the participant (does NOT regenerate the token).
// Rate-limited: max 3 resends in 24 hours per registration.
export async function POST(req: NextRequest, { params }: Params) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await params;
  const db = getSupabaseServer();

  // Fetch registration — must belong to authenticated user
  const { data: reg } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name, event_id,
      distance_category, status, payment_status, qr_token
    `)
    .eq("registration_code", code.toUpperCase())
    .eq("user_email", userEmail.toLowerCase())
    .single();

  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.status === "cancelled") return NextResponse.json({ error: "Registration is cancelled" }, { status: 400 });
  if (reg.payment_status === "pending") return NextResponse.json({ error: "Complete payment first" }, { status: 400 });
  if (!reg.qr_token) return NextResponse.json({ error: "QR code not yet generated" }, { status: 400 });

  // Rate-limit check: count emails sent in last 24h for this registration
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await db
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("event_id", reg.event_id)
    .eq("recipient_email", reg.user_email)
    .ilike("subject", "%QR%")
    .gte("created_at", cutoff);

  if ((recentCount ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Maximum 3 QR resends per day reached. Contact support if needed." },
      { status: 429 }
    );
  }

  // Fetch event details for email
  const { data: ev } = await db
    .from("events")
    .select("title, start_date, start_time, location")
    .eq("id", reg.event_id)
    .single();

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
      qrToken:          reg.qr_token,
    }),
    false, true,
  );

  if (!result.ok) return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  return NextResponse.json({ ok: true, message: `QR code sent to ${reg.user_email}` });
}
