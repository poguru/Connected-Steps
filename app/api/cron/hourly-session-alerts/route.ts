// Cron: every hour at :00 UTC  →  schedule "0 * * * *"
//
// Two checks per run:
//   1. Sessions starting 50-70 min from now  → "Session in 1 Hour!" reminder
//   2. Sessions that started 20-50 min ago   → "Don't forget to scan" attendance nudge
//      (only sent to users who registered but haven't scanned yet)
//
// Uses IST (UTC+5:30) for all datetime comparisons because session dates/times
// are stored in IST without explicit timezone info.

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotifications } from "@/lib/notify-inapp";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db    = getSupabaseServer();
  const nowMs = Date.now();

  // IST offset: +5h30m
  const nowIST      = new Date(nowMs + 5.5 * 3600 * 1000);
  const todayIST    = nowIST.toISOString().slice(0, 10);
  const tomorrowIST = new Date(nowIST.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Fetch sessions for today + tomorrow (covers all edge cases near midnight IST)
  const { data: sessions } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .in("date", [todayIST, tomorrowIST]);

  if (!sessions?.length) {
    return NextResponse.json({ message: "No sessions today/tomorrow", checked: 0 });
  }

  // Classify each session by its start time relative to now
  type S = typeof sessions[number];

  function sessionStartMs(s: S): number {
    const [h, m] = (s.time ?? "06:00").split(":").map(Number);
    return new Date(
      `${s.date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`
    ).getTime();
  }

  const oneHourSessions   = sessions.filter(s => { const ms = sessionStartMs(s); return ms >= nowMs + 50 * 60_000 && ms <= nowMs + 70 * 60_000; });
  const attendanceSessions = sessions.filter(s => { const ms = sessionStartMs(s); return ms >= nowMs - 50 * 60_000 && ms <= nowMs - 20 * 60_000; });

  const results: Record<string, unknown>[] = [];

  // ── 1. One-hour reminders ────────────────────────────────────────────────────
  for (const session of oneHourSessions) {
    const venue = session.venue || session.location;

    const { data: attendees } = await db
      .from("session_attendance")
      .select("user_email")
      .eq("session_id", session.id)
      .eq("attended", false);

    if (!attendees?.length) { results.push({ check: "1h", session: session.title, notified: 0 }); continue; }

    await createNotifications(
      attendees.map(a => ({ email: a.user_email })),
      "session_reminder",
      `Session in 1 Hour! ⏰`,
      `${session.title} starts at ${session.time ?? "6:00"} at ${venue}. See you there! 🏃`,
      `/join/${session.id}`,
    );

    results.push({ check: "1h", session: session.title, notified: attendees.length });
  }

  // ── 2. Attendance nudge (session started, not yet scanned) ───────────────────
  for (const session of attendanceSessions) {
    const { data: unscanned } = await db
      .from("session_attendance")
      .select("user_email")
      .eq("session_id", session.id)
      .eq("attended", false);

    if (!unscanned?.length) { results.push({ check: "scan-nudge", session: session.title, notified: 0 }); continue; }

    await createNotifications(
      unscanned.map(a => ({ email: a.user_email })),
      "session_reminder",
      `Don't forget to scan attendance! 📱`,
      `You're registered for ${session.title}. Scan the QR code with your coach to record your attendance.`,
      `/scan`,
    );

    results.push({ check: "scan-nudge", session: session.title, notified: unscanned.length });
  }

  return NextResponse.json({ results, oneHourCount: oneHourSessions.length, attendanceCount: attendanceSessions.length });
}
