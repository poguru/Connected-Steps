// Daily cron at 6:00 PM IST (12:30 UTC) — vercel.json: "30 12 * * *"
//
// Sends ONE email + ONE WhatsApp per active member listing ALL of tomorrow's sessions.
// No session pre-registration required — every active user receives reminders.
//
// Idempotency: acquireCronLock (cron_runs table) prevents double-runs per day.
// Dedup: session_reminder_log UNIQUE(user_email, reminder_date, channel) prevents
//        duplicate sends even on partial-run retries.

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, sendWhatsApp, sessionWAParams } from "@/lib/notify";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { sessionReminderEmailHTML, type SessionForEmail } from "@/lib/session-reminder-email";

interface ActiveUser {
  email:      string;
  first_name: string | null;
  last_name:  string | null;
  phone:      string | null;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db      = getSupabaseServer();
  const startMs = Date.now();

  // ── Dates in IST (UTC+5:30) ────────────────────────────────────────────────
  const nowIST        = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const executionDate = nowIST.toISOString().slice(0, 10);       // today IST — cron lock + dedup key
  const tomorrowIST   = new Date(nowIST);
  tomorrowIST.setDate(tomorrowIST.getDate() + 1);
  const tomorrowStr   = tomorrowIST.toISOString().slice(0, 10); // YYYY-MM-DD

  // ── Phase 1: fetch tomorrow's sessions (no lock held) ─────────────────────
  const { data: sessions, error: sessErr } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("date", tomorrowStr)
    .order("time", { ascending: true, nullsFirst: false });

  if (sessErr) {
    console.error("[session-reminders] DB error fetching sessions:", sessErr.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (!sessions?.length) {
    console.log(`[session-reminders] no sessions on ${tomorrowStr}`);
    return NextResponse.json({ message: "No sessions tomorrow", date: tomorrowStr });
  }

  // ── Phase 1b: read channel-enable settings ────────────────────────────────
  const { data: settingsRows } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["session_reminder_email_enabled", "session_reminder_wa_enabled"]);

  const sm           = Object.fromEntries((settingsRows ?? []).map(r => [r.key, r.value]));
  const emailEnabled = sm["session_reminder_email_enabled"] !== "false";
  const waEnabled    = sm["session_reminder_wa_enabled"]    !== "false";

  // ── Phase 2: acquire cron lock ────────────────────────────────────────────
  const acquired = await acquireCronLock("session-reminders", executionDate);
  if (!acquired) {
    console.log(`[session-reminders] already ran for ${executionDate} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: executionDate });
  }

  // ── Phase 3: send reminders (lock held) ───────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

  try {
    // Fetch ALL active members
    const { data: userRows, error: userErr } = await db
      .from("users")
      .select("email, first_name, last_name, phone")
      .eq("is_active", true);

    if (userErr) throw new Error(userErr.message);

    const users: ActiveUser[] = (userRows ?? []).map(u => ({
      email:      u.email,
      first_name: u.first_name ?? null,
      last_name:  u.last_name  ?? null,
      phone:      u.phone      ?? null,
    }));

    if (!users.length) {
      console.log("[session-reminders] no active users found");
      return NextResponse.json({ ok: true, date: tomorrowStr, sessions: sessions.length, recipients: 0 });
    }

    // Dedup check — find users who already received a reminder today (retry safety)
    const { data: alreadySentRows } = await db
      .from("session_reminder_log")
      .select("user_email, channel")
      .eq("reminder_date", executionDate)
      .eq("status", "sent");

    const sentKey = (email: string, ch: string) => `${email.toLowerCase()}:${ch}`;
    const sentSet = new Set((alreadySentRows ?? []).map(r => sentKey(r.user_email, r.channel)));

    const emailSubject = sessions.length === 1
      ? `Tomorrow: ${sessions[0].title} | Connected Steps`
      : `Tomorrow's ${sessions.length} Training Sessions | Connected Steps`;

    const sessionsForEmail = sessions as SessionForEmail[];
    const primarySession   = sessions[0];
    const primaryVenue     = primarySession.venue || primarySession.location || "Hyderabad";
    const waTitle          = sessions.length === 1
      ? primarySession.title
      : `${primarySession.title} + ${sessions.length - 1} more`;

    let emailSent = 0, emailFail = 0, waSent = 0, waFail = 0;

    await Promise.allSettled(
      users.map(async (user) => {
        const name = (user.first_name ?? "").trim() || "there";

        // ── Email: one per user, all sessions in one message ────────────────
        if (emailEnabled && !sentSet.has(sentKey(user.email, "email"))) {
          let ok = false; let errMsg: string | null = null;
          try {
            const html   = sessionReminderEmailHTML(name, sessionsForEmail, tomorrowStr, `${appUrl}/sessions`);
            const result = await sendEmail(
              user.email,
              name,
              emailSubject,
              html,
              false,  // isOtp
              false,  // isTransactional
              `${appUrl}/api/unsubscribe?email=${encodeURIComponent(user.email)}`,
            );
            ok     = result.ok;
            errMsg = result.ok ? null : (result.error ?? "provider_error");
          } catch (e) {
            errMsg = e instanceof Error ? e.message : String(e);
          }

          const { error: logErr } = await db.from("session_reminder_log").insert({
            user_email:     user.email,
            reminder_date:  executionDate,
            sessions_count: sessions.length,
            channel:        "email",
            status:         ok ? "sent" : "failed",
            error_msg:      errMsg,
          });
          if (!logErr || logErr.code === "23505") {
            if (ok) emailSent++; else emailFail++;
          }
        }

        // ── WhatsApp: one per user using approved session_alert_v3 template ─
        // For multiple sessions: primary session title + "X more" suffix.
        if (waEnabled && user.phone && !sentSet.has(sentKey(user.email, "whatsapp"))) {
          let ok = false; let errMsg: string | null = null;
          try {
            const params = sessionWAParams(
              name,
              waTitle,
              primarySession.date,
              primarySession.time,
              primaryVenue,
            );
            const result = await sendWhatsApp(user.phone, params);
            ok     = result.ok;
            errMsg = result.ok ? null : (result.error ?? "provider_error");
          } catch (e) {
            errMsg = e instanceof Error ? e.message : String(e);
          }

          const { error: logErr } = await db.from("session_reminder_log").insert({
            user_email:     user.email,
            reminder_date:  executionDate,
            sessions_count: sessions.length,
            channel:        "whatsapp",
            status:         ok ? "sent" : "failed",
            error_msg:      errMsg,
          });
          if (!logErr || logErr.code === "23505") {
            if (ok) waSent++; else waFail++;
          }
        }
      })
    );

    const duration = Date.now() - startMs;
    console.log(
      `[session-reminders] date=${tomorrowStr} sessions=${sessions.length}` +
      ` recipients=${users.length} email=${emailSent}/${emailFail}err` +
      ` wa=${waSent}/${waFail}err duration=${duration}ms`,
    );

    return NextResponse.json({
      ok:           true,
      date:         tomorrowStr,
      sessions:     sessions.length,
      recipients:   users.length,
      email_sent:   emailSent,
      email_fail:   emailFail,
      wa_sent:      waSent,
      wa_fail:      waFail,
      duration_ms:  duration,
    });

  } catch (err: unknown) {
    await releaseCronLock("session-reminders", executionDate);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[session-reminders] fatal error (lock released):", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
