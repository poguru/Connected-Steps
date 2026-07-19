import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, sendWhatsApp, sessionWAParams } from "@/lib/notify";
import { sessionReminderEmailHTML, type SessionForEmail } from "@/lib/session-reminder-email";

function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return !!(token && verifyAdminSession(token));
}

// POST /api/admin/reminders/test
// Body: { session_id, test_email, test_phone?, channels: string[] }
// Sends a live test reminder using the multi-session email template.
// Does NOT log to session_reminder_log.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    session_id:  string;
    test_email:  string;
    test_phone?: string;
    channels:    string[];
  };

  const { session_id, test_email, test_phone, channels } = body;
  if (!session_id || !test_email || !channels?.length) {
    return NextResponse.json({ error: "session_id, test_email and channels required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("id", session_id)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const venue   = session.venue || session.location || "Hyderabad";
  const name    = test_email.split("@")[0] || "Admin";

  // Use tomorrow's date for display (since this is a preview of a reminder)
  const nowIST      = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const tomorrowIST = new Date(nowIST);
  tomorrowIST.setDate(tomorrowIST.getDate() + 1);
  const tomorrowStr = tomorrowIST.toISOString().slice(0, 10);

  const sessionsForEmail: SessionForEmail[] = [
    { id: session.id, title: session.title, date: session.date, time: session.time, venue: session.venue, location: session.location },
  ];

  const report: Record<string, { ok: boolean; error?: string }> = {};

  if (channels.includes("email")) {
    try {
      const html   = sessionReminderEmailHTML(name, sessionsForEmail, tomorrowStr, `${appUrl}/sessions`);
      const result = await sendEmail(
        test_email,
        name,
        `[TEST] Tomorrow: ${session.title} | Connected Steps`,
        html,
        false,
        true,  // isTransactional = true bypasses NON_OTP_EMAILS_DISABLED for test sends
      );
      report.email = { ok: result.ok, error: result.error };
    } catch (e) {
      report.email = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (channels.includes("whatsapp")) {
    const phone = test_phone?.trim() || null;
    if (phone) {
      try {
        const params = sessionWAParams(name, session.title, session.date, session.time, venue);
        const result = await sendWhatsApp(phone, params);
        report.whatsapp = { ok: result.ok, error: result.error };
      } catch (e) {
        report.whatsapp = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      report.whatsapp = { ok: false, error: "No phone number provided for WhatsApp test" };
    }
  }

  return NextResponse.json({ ok: true, session: session.title, report });
}
