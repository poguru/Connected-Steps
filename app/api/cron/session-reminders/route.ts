// Daily cron at 6:00 PM IST (12:30 UTC) — vercel.json: "30 12 * * *"
// Finds tomorrow's sessions, sends email + WhatsApp + in-app to every
// registered active user who hasn't already received that channel's reminder.
//
// Idempotency: acquireCronLock (cron_runs table) prevents double-runs per day.
// Dedup: session_reminder_log UNIQUE(user_email, session_id, channel) prevents
//        duplicate sends even on partial-run retries.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotifications } from "@/lib/notify-inapp";
import { sendEmail, sendWhatsApp, sessionWAParams } from "@/lib/notify";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { sessionReminderEmailHTML } from "@/lib/session-reminder-email";

type UserRow = { first_name: string | null; last_name: string | null; phone: string | null; is_active: boolean };

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db      = getSupabaseServer();
  const startMs = Date.now();

  // ── Dates in IST (UTC+5:30) ────────────────────────────────────────────────
  const nowIST        = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const executionDate = nowIST.toISOString().slice(0, 10);          // today IST — cron lock key
  const tomorrowIST   = new Date(nowIST);
  tomorrowIST.setDate(tomorrowIST.getDate() + 1);
  const tomorrowStr   = tomorrowIST.toISOString().slice(0, 10);    // YYYY-MM-DD

  // ── Phase 1: fetch data (no lock held) ────────────────────────────────────
  const { data: sessions, error: sessErr } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("date", tomorrowStr);

  if (sessErr) {
    console.error("[session-reminders] DB error fetching sessions:", sessErr.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (!sessions?.length) {
    console.log(`[session-reminders] no sessions on ${tomorrowStr}`);
    return NextResponse.json({ message: "No sessions tomorrow", date: tomorrowStr });
  }

  // Read admin settings
  const { data: settingsRows } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "session_reminder_email_enabled",
      "session_reminder_wa_enabled",
      "session_reminder_inapp_enabled",
    ]);

  const sm = Object.fromEntries((settingsRows ?? []).map(r => [r.key, r.value]));
  const emailEnabled = sm["session_reminder_email_enabled"] !== "false";
  const waEnabled    = sm["session_reminder_wa_enabled"]    !== "false";
  const inappEnabled = sm["session_reminder_inapp_enabled"] !== "false";

  // ── Phase 2: acquire lock ─────────────────────────────────────────────────
  const acquired = await acquireCronLock("session-reminders", executionDate);
  if (!acquired) {
    console.log(`[session-reminders] already ran for ${executionDate} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: executionDate });
  }

  // ── Phase 3: process sessions (lock held) ─────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

  interface SessionResult {
    session:     string;
    session_id:  string;
    eligible:    number;
    email_sent:  number;
    email_fail:  number;
    wa_sent:     number;
    wa_fail:     number;
    inapp_sent:  number;
  }

  const results: SessionResult[] = [];

  try {
    for (const session of sessions) {
      const venue   = session.venue || session.location;
      const timeStr = session.time  || "6:00 AM";
      const joinUrl = `${appUrl}/join/${session.id}`;
      const dateStr = new Date(session.date + "T12:00:00Z").toLocaleDateString("en-IN", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });

      // Registered active users for this session
      const { data: attendeeRows } = await db
        .from("session_attendance")
        .select("user_email, users!inner(first_name, last_name, phone, is_active)")
        .eq("session_id", session.id)
        .eq("attended", false);

      const attendees = (attendeeRows ?? [])
        .map(a => ({ email: a.user_email, ...(a.users as unknown as UserRow) }))
        .filter(a => a.is_active !== false);

      if (!attendees.length) {
        results.push({ session: session.title, session_id: session.id, eligible: 0, email_sent: 0, email_fail: 0, wa_sent: 0, wa_fail: 0, inapp_sent: 0 });
        continue;
      }

      // Already-sent log for this session — used to skip duplicates on retry
      const { data: alreadySentRows } = await db
        .from("session_reminder_log")
        .select("user_email, channel")
        .eq("session_id", session.id)
        .eq("status", "sent");

      const sentKey = (email: string, ch: string) => `${email.toLowerCase()}:${ch}`;
      const sentSet = new Set((alreadySentRows ?? []).map(r => sentKey(r.user_email, r.channel)));

      let emailSent = 0, emailFail = 0, waSent = 0, waFail = 0, inappSent = 0;

      // ── In-app (batch) ────────────────────────────────────────────────────
      if (inappEnabled) {
        const targets = attendees.filter(a => !sentSet.has(sentKey(a.email, "inapp")));
        if (targets.length) {
          await createNotifications(
            targets.map(a => ({ email: a.email })),
            "session_reminder",
            `${session.title} is tomorrow`,
            `See you at ${venue} at ${timeStr}. Get good sleep tonight!`,
            `/join/${session.id}`,
          ).catch(e => console.error("[session-reminders] inapp batch error:", e));

          // Log each in-app send (ON CONFLICT DO NOTHING via 23505 check)
          const logInserts = await Promise.allSettled(
            targets.map(a =>
              db.from("session_reminder_log").insert({
                user_email: a.email,
                session_id: session.id,
                channel:    "inapp",
                status:     "sent",
              })
            )
          );
          inappSent = logInserts.filter(r => {
            if (r.status !== "fulfilled") return false;
            const err = r.value.error;
            return !err || err.code === "23505";
          }).length;
        }
      }

      // ── Per-user: email + WhatsApp ─────────────────────────────────────────
      await Promise.allSettled(
        attendees.map(async (a) => {
          const name = (a.first_name ?? "").trim() || "there";

          // Email
          if (emailEnabled && !sentSet.has(sentKey(a.email, "email"))) {
            let ok = false; let errMsg: string | null = null;
            try {
              const html   = sessionReminderEmailHTML(name, session.title, dateStr, timeStr, venue, joinUrl);
              const result = await sendEmail(
                a.email,
                name,
                `Tomorrow's Training Session - ${session.title} | Connected Steps`,
                html,
                false,  // isOtp
                false,  // isTransactional
                `${appUrl}/api/unsubscribe?email=${encodeURIComponent(a.email)}`,
              );
              ok     = result.ok;
              errMsg = result.ok ? null : (result.error ?? "provider_error");
            } catch (e) {
              errMsg = e instanceof Error ? e.message : String(e);
            }

            const { error: logErr } = await db.from("session_reminder_log").insert({
              user_email: a.email, session_id: session.id, channel: "email",
              status:     ok ? "sent" : "failed",
              error_msg:  errMsg,
            });
            // 23505 = duplicate (already logged in prior partial run), not a real error
            if (!logErr || logErr.code === "23505") {
              if (ok) emailSent++; else emailFail++;
            }
          }

          // WhatsApp
          if (waEnabled && a.phone && !sentSet.has(sentKey(a.email, "whatsapp"))) {
            let ok = false; let errMsg: string | null = null;
            try {
              const params = sessionWAParams(name, session.title, session.date, session.time, venue);
              const result = await sendWhatsApp(a.phone, params);
              ok     = result.ok;
              errMsg = result.ok ? null : (result.error ?? "provider_error");
            } catch (e) {
              errMsg = e instanceof Error ? e.message : String(e);
            }

            const { error: logErr } = await db.from("session_reminder_log").insert({
              user_email: a.email, session_id: session.id, channel: "whatsapp",
              status:     ok ? "sent" : "failed",
              error_msg:  errMsg,
            });
            if (!logErr || logErr.code === "23505") {
              if (ok) waSent++; else waFail++;
            }
          }
        })
      );

      results.push({ session: session.title, session_id: session.id, eligible: attendees.length, email_sent: emailSent, email_fail: emailFail, wa_sent: waSent, wa_fail: waFail, inapp_sent: inappSent });
    }

    const totals = results.reduce(
      (acc, r) => ({
        email: acc.email + r.email_sent,
        wa:    acc.wa    + r.wa_sent,
        inapp: acc.inapp + r.inapp_sent,
      }),
      { email: 0, wa: 0, inapp: 0 },
    );

    console.log(
      `[session-reminders] date=${tomorrowStr} sessions=${sessions.length}` +
      ` email=${totals.email} wa=${totals.wa} inapp=${totals.inapp}` +
      ` duration=${Date.now() - startMs}ms`,
    );

    return NextResponse.json({ ok: true, date: tomorrowStr, settings: { emailEnabled, waEnabled, inappEnabled }, results });

  } catch (err: unknown) {
    await releaseCronLock("session-reminders", executionDate);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[session-reminders] fatal error (lock released):", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
