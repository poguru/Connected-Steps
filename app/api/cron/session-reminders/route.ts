// Cron: daily at 7pm IST (13:30 UTC)
// Finds sessions happening tomorrow and sends in-app + push + WhatsApp reminders
// to all users who have registered (session_attendance row exists).
//
// Add to vercel.json:
// { "path": "/api/cron/session-reminders", "schedule": "30 13 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotifications } from "@/lib/notify-inapp";
import { sendWhatsApp, sessionWAParams } from "@/lib/notify";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Tomorrow's date in IST (UTC+5:30)
  const nowIST      = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const tomorrowIST = new Date(nowIST);
  tomorrowIST.setDate(tomorrowIST.getDate() + 1);
  const tomorrowStr = tomorrowIST.toISOString().slice(0, 10); // YYYY-MM-DD

  // Find sessions scheduled for tomorrow
  const { data: sessions, error: sessErr } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("date", tomorrowStr);

  if (sessErr || !sessions?.length) {
    return NextResponse.json({ message: "No sessions tomorrow", date: tomorrowStr });
  }

  const results: { session: string; notified: number; whatsapp: number }[] = [];

  for (const session of sessions) {
    // Find registered users (attended=false = registered but not yet attended)
    const { data: attendees } = await db
      .from("session_attendance")
      .select("user_email, users!inner(first_name, phone)")
      .eq("session_id", session.id)
      .eq("attended", false);

    if (!attendees?.length) { results.push({ session: session.title, notified: 0, whatsapp: 0 }); continue; }

    const venue   = session.venue || session.location;
    const timeStr = session.time  || "6:00am";

    // ── In-app + push notifications ──────────────────────────────────────────
    await createNotifications(
      attendees.map(a => ({ email: a.user_email })),
      "session_reminder",
      `${session.title} is tomorrow`,
      `See you at ${venue} at ${timeStr}. Stay hydrated and get good sleep tonight! 🏃`,
      `/join/${session.id}`,
    );

    // ── WhatsApp reminders ────────────────────────────────────────────────────
    let waCount = 0;
    for (const a of attendees) {
      const user = a.users as unknown as { first_name: string; phone: string } | null;
      if (!user?.phone) continue;
      const params = sessionWAParams(
        user.first_name, session.title, session.date, session.time, venue
      );
      const result = await sendWhatsApp(user.phone, params).catch(() => ({ ok: false }));
      if (result.ok) waCount++;
    }

    results.push({ session: session.title, notified: attendees.length, whatsapp: waCount });
  }

  return NextResponse.json({ date: tomorrowStr, results });
}
