import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";
import { verifyUserToken } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notify-inapp";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Check join status only for authenticated users
  let already_joined = false;
  const userToken = req.headers.get("x-user-token");
  if (userToken) {
    const userEmail = verifyUserToken(userToken);
    if (userEmail) {
      const { data: existing } = await db
        .from("session_attendance")
        .select("id")
        .eq("session_id", id)
        .eq("user_email", userEmail.toLowerCase())
        .single();
      already_joined = !!existing;
    }
  }

  return NextResponse.json({ session, already_joined });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Require authenticated user — email comes from token, not request body
  const userToken = req.headers.get("x-user-token");
  if (!userToken) return NextResponse.json({ error: "Please log in to join a session." }, { status: 401 });
  const email = verifyUserToken(userToken);
  if (!email) return NextResponse.json({ error: "Session expired — please log in again." }, { status: 401 });

  const blocked = await requireActiveUser(email);
  if (blocked) return blocked;

  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // Block joining if session was more than 2 hours ago
  const sessionTime = session.time ?? "00:00";
  const [hours, minutes] = sessionTime.split(":").map(Number);
  const sessionStart = new Date(`${session.date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`);
  const deadline = new Date(sessionStart.getTime() + 2 * 60 * 60 * 1000);
  if (new Date() > deadline) {
    return NextResponse.json({ error: "Registration is closed. You can only join up to 2 hours after the session starts." }, { status: 410 });
  }

  const { data: user } = await db
    .from("users")
    .select("email, first_name, last_name")
    .eq("email", email.toLowerCase().trim())
    .single();
  if (!user) return NextResponse.json({ error: "No Connected Steps account found for this email. Please sign up first." }, { status: 404 });

  const { data: existing } = await db
    .from("session_attendance")
    .select("id")
    .eq("session_id", id)
    .eq("user_email", email.toLowerCase().trim())
    .single();

  if (existing) return NextResponse.json({ success: true, already: true, session });

  const { error } = await db.from("session_attendance").insert({
    session_id:    id,
    user_email:    user.email,
    user_name:     `${user.first_name} ${user.last_name}`.trim(),
    attended:      false,
    bonus_points:  0,
    bonus_reason:  "",
    points_synced: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget: confirmation email + in-app notification
  sendJoinConfirmationEmail({
    email:     user.email,
    firstName: user.first_name,
    title:     session.title,
    date:      session.date,
    time:      session.time,
    venue:     session.venue || session.location,
  }).catch(e => console.error("Join confirmation email failed:", e));

  const dateLabel = new Date(session.date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
  createNotification({
    user_email: user.email,
    type:       "session_reminder",
    title:      "You're registered! ✅",
    body:       `${session.title} · ${dateLabel}${session.time ? ` at ${session.time}` : ""}${session.venue ? ` · ${session.venue}` : ""}`,
    action_url: `/join/${id}`,
  }).catch(() => {});

  return NextResponse.json({ success: true, already: false, session });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userToken = req.headers.get("x-user-token");
  if (!userToken) return NextResponse.json({ error: "Please log in to leave a session." }, { status: 401 });
  const email = verifyUserToken(userToken);
  if (!email) return NextResponse.json({ error: "Session expired — please log in again." }, { status: 401 });

  const blocked = await requireActiveUser(email);
  if (blocked) return blocked;

  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, date, time")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // Block leaving if session has already started
  const sessionTime = session.time ?? "00:00";
  const [hours, minutes] = sessionTime.split(":").map(Number);
  const sessionStart = new Date(`${session.date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`);
  if (new Date() >= sessionStart) {
    return NextResponse.json({ error: "You cannot leave a session that has already started." }, { status: 400 });
  }

  // Check if points have been synced — don't allow leaving after that
  const { data: attendance } = await db
    .from("session_attendance")
    .select("id, points_synced")
    .eq("session_id", id)
    .eq("user_email", email.toLowerCase().trim())
    .single();

  if (!attendance) return NextResponse.json({ error: "You are not registered for this session." }, { status: 404 });
  if (attendance.points_synced) return NextResponse.json({ error: "Your attendance has already been recorded and points synced. Please contact the admin." }, { status: 400 });

  const { error } = await db
    .from("session_attendance")
    .delete()
    .eq("session_id", id)
    .eq("user_email", email.toLowerCase().trim());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

async function sendJoinConfirmationEmail(p: {
  email:     string;
  firstName: string;
  title:     string;
  date:      string;
  time:      string | null;
  venue:     string | null;
}) {
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const firstName = p.firstName || "there";
  const dateLabel = formatDate(p.date) + (p.time ? ` at ${p.time}` : "");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr><td style="background:#0a0a0a;padding:24px 36px;">
        <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Connected Steps</div>
        <div style="font-size:10px;color:#e8620a;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px;">Your Goal, Our Plan</div>
      </td></tr>
      <tr><td style="height:4px;background:#e8620a;"></td></tr>

      <!-- Confirmation banner -->
      <tr><td style="background:#0f2a0f;padding:20px 36px;text-align:center;">
        <div style="font-size:28px;margin-bottom:6px;">✅</div>
        <div style="font-size:18px;font-weight:700;color:#4ade80;">Your Registration is Confirmed!</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:32px 36px;">
        <p style="margin:0 0 8px;font-size:15px;color:#333;">Hi <strong>${firstName}</strong>,</p>
        <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
          You're all set for the upcoming Connected Steps training session. We're excited to have you — see you on the track! 🏃
        </p>

        <!-- Session card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f4;border:1px solid #fde0c8;border-radius:10px;overflow:hidden;margin-bottom:28px;">
          <tr><td style="padding:16px 20px;border-bottom:1px solid #fde0c8;">
            <div style="font-size:10px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Session</div>
            <div style="font-size:18px;font-weight:700;color:#0a0a0a;">${p.title}</div>
          </td></tr>
          <tr><td style="padding:14px 20px;">
            <div style="font-size:13px;color:#444;margin-bottom:6px;">📅 <strong>${dateLabel}</strong></div>
            ${p.venue ? `<div style="font-size:13px;color:#444;">📍 <strong>${p.venue}</strong></div>` : ""}
          </td></tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
          <tr><td style="background:#e8620a;border-radius:6px;">
            <a href="${appUrl}/dashboard" style="display:block;padding:13px 36px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">
              Go to Dashboard →
            </a>
          </td></tr>
        </table>

        <!-- Reminder tip -->
        <p style="margin:0 0 6px;font-size:13px;color:#888;line-height:1.6;text-align:center;">
          Arrive 10–15 minutes early for warm-up. Carry a water bottle! 💧
        </p>
      </td></tr>

      <!-- Contact -->
      <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:18px 36px;">
        <p style="margin:0 0 4px;font-size:13px;color:#555;font-weight:600;">In case of any queries or questions</p>
        <p style="margin:0;font-size:13px;color:#555;">
          📞 Call / WhatsApp us at
          <a href="https://wa.me/919703620570" style="color:#e8620a;text-decoration:none;font-weight:700;">+91 97036 20570</a>
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:14px 36px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#aaa;">
          Connected Steps · Hyderabad, India ·
          <a href="${appUrl}" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const { sendSingleEmail } = await import("@/lib/email-service");
  const result = await sendSingleEmail({ to: p.email, subject: `Your registration is confirmed — ${p.title} | Connected Steps`, html });
  if (!result.ok) console.error(`[SES] join confirmation failed for ${p.email}:`, result.error);
}
