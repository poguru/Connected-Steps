import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const email = req.nextUrl.searchParams.get("email");
  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let already_joined = false;
  if (email) {
    const { data: existing } = await db
      .from("session_attendance")
      .select("id")
      .eq("session_id", id)
      .eq("user_email", email.toLowerCase().trim())
      .single();
    already_joined = !!existing;
  }

  return NextResponse.json({ session, already_joined });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

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

  // Fire-and-forget confirmation email
  sendJoinConfirmationEmail({
    email:     user.email,
    firstName: user.first_name,
    title:     session.title,
    date:      session.date,
    time:      session.time,
    venue:     session.venue || session.location,
  }).catch(() => {});

  return NextResponse.json({ success: true, already: false, session });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

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
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const fromEmail = process.env.RESEND_FROM_EMAIL   ?? "Connected Steps <noreply@connectedsteps.in>";
  const firstName = p.firstName || "there";
  const dateLabel = formatDate(p.date) + (p.time ? ` at ${p.time}` : "");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0d0d0d;border-radius:10px;overflow:hidden;">
      <!-- Header -->
      <div style="background:#111;padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:1rem;font-weight:700;color:#fff;">Connected Steps</span>
      </div>

      <!-- Body -->
      <div style="padding:28px;">
        <p style="color:#e0e0e0;margin:0 0 6px;">Hi <strong>${firstName}</strong>,</p>
        <p style="color:#e0e0e0;margin:0 0 20px;">You're registered for the upcoming training session. See you on the track! 🏃</p>

        <!-- Session details -->
        <div style="background:rgba(255,122,0,0.07);border:1px solid rgba(255,122,0,0.25);border-radius:8px;padding:18px 20px;margin-bottom:24px;line-height:1.9;">
          <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:10px;">${p.title}</div>
          <div style="font-size:13px;color:#ccc;">📅 ${dateLabel}</div>
          ${p.venue ? `<div style="font-size:13px;color:#ccc;">📍 ${p.venue}</div>` : ""}
        </div>

        <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 28px;background:#ff7a00;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
          Go to Dashboard →
        </a>

        <p style="color:#555;font-size:12px;margin-top:28px;">
          Can't make it? Open the session link and tap <em>Leave</em> before it starts so the spot is freed up.
        </p>
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);">
        <p style="color:#444;font-size:11px;margin:0;">Connected Steps · <a href="${appUrl}" style="color:#ff7a00;text-decoration:none;">connectedsteps.in</a></p>
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from:    fromEmail,
      to:      [p.email],
      subject: `You're registered for ${p.title} — Connected Steps`,
      html,
    }),
  });
}
