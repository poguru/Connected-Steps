import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, sendWhatsApp, sessionWAParams } from "@/lib/notify";
import { createNotification } from "@/lib/notify-inapp";
import { sessionReminderEmailHTML } from "@/lib/session-reminder-email";

function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return !!(token && verifyAdminSession(token));
}

// POST /api/admin/reminders/test
// Body: { session_id, test_email, test_phone?, channels: string[] }
// Sends a live test reminder to the provided email/phone. Does NOT log to session_reminder_log.
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
  const venue   = session.venue || session.location;
  const timeStr = session.time  || "6:00 AM";
  const joinUrl = `${appUrl}/join/${session.id}`;
  const dateStr = new Date(session.date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const name = test_email.split("@")[0] || "Admin";

  const report: Record<string, { ok: boolean; error?: string }> = {};

  if (channels.includes("email")) {
    try {
      const html   = sessionReminderEmailHTML(name, session.title, dateStr, timeStr, venue, joinUrl);
      const result = await sendEmail(
        test_email,
        name,
        `[TEST] Tomorrow's Training Session - ${session.title} | Connected Steps`,
        html,
        false,
        true,  // isTransactional = true so NON_OTP_EMAILS_DISABLED doesn't block test sends
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

  if (channels.includes("inapp")) {
    try {
      await createNotification({
        user_email: test_email,
        type:       "session_reminder",
        title:      `[TEST] ${session.title} is tomorrow`,
        body:       `See you at ${venue} at ${timeStr}. Get good sleep tonight!`,
        action_url: `/join/${session.id}`,
      });
      report.inapp = { ok: true };
    } catch (e) {
      report.inapp = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, session: session.title, report });
}
