import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendSingleEmail } from "@/lib/email-service";

// ── Post-Event Feedback Invitation Cron ───────────────────────────────────────
//
// Runs once daily via Vercel cron (schedule configured in vercel.json).
// Sends initial feedback invitation emails approximately 2 hours after each
// event completes, and a single reminder ~24 hours later for participants
// who have not yet submitted feedback.
//
// Idempotency: event_feedback_invitations has UNIQUE(it_run_event_id, email, channel, invite_type).
// Inserting with ON CONFLICT DO NOTHING means re-runs are safe.
//
// Does NOT modify: email-sender cron, email_queue, or any existing table.

export const maxDuration = 300;

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://connectedsteps.in";
const FROM_EMAIL   = process.env.ZEPTOMAIL_FROM_EMAIL ?? "noreply@connectedsteps.in";
const FROM_NAME    = process.env.ZEPTOMAIL_FROM_NAME  ?? "Connected Steps";

// How long after event_date (IST end-of-day) to send the initial invite (2 hours)
const INITIAL_DELAY_MS = 2 * 60 * 60 * 1000;

// Window within which the initial invite is sent (don't send if event ended >48h ago)
const INITIAL_WINDOW_MS = 48 * 60 * 60 * 1000;

// Send reminder ~24h after initial invite only if feedback not submitted
const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;

// Max emails per run (prevents Vercel timeout; re-runs pick up the remainder)
const MAX_SENDS_PER_RUN = 200;

// ── Email templates ───────────────────────────────────────────────────────────

function buildInitialInviteEmail(params: {
  participantName: string;
  registrationCode: string;
  eventTitle: string;
  eventDate: string;
}): { subject: string; html: string } {
  const { participantName, registrationCode, eventTitle, eventDate } = params;
  const feedbackUrl = `${APP_BASE_URL}/it-run/feedback?code=${encodeURIComponent(registrationCode)}`;
  const name = participantName || "Runner";
  const dateStr = new Date(`${eventDate}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return {
    subject: `How was your ${eventTitle} experience?`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your feedback matters</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .wrap { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background: #e8620a; padding: 28px 32px; }
    .header h1 { color: #fff; font-size: 20px; margin: 0; font-weight: 800; }
    .header p { color: rgba(255,255,255,0.75); font-size: 13px; margin: 4px 0 0; }
    .body { padding: 28px 32px; }
    .body p { color: #444; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .stars { font-size: 28px; letter-spacing: 4px; color: #e8620a; margin: 8px 0 20px; }
    .btn { display: inline-block; padding: 14px 32px; background: #e8620a; color: #fff !important;
           text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; margin: 8px 0 20px; }
    .btn:hover { background: #c2520a; }
    .footer { padding: 20px 32px; border-top: 1px solid #f0f0f0; }
    .footer p { color: #999; font-size: 12px; margin: 0; line-height: 1.5; }
    .code { font-family: monospace; background: #f5f5f5; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>${eventTitle}</h1>
      <p>${dateStr}</p>
    </div>
    <div class="body">
      <p>Hi ${name},</p>
      <p>Congratulations on completing <strong>${eventTitle}</strong>! We hope you had a great run. 🏃</p>
      <p>Your feedback helps us make every edition better. It takes under 2 minutes.</p>
      <div class="stars">★★★★★</div>
      <p>
        <a class="btn" href="${feedbackUrl}">Share Your Feedback</a>
      </p>
      <p style="font-size: 13px; color: #888;">
        Your registration code: <span class="code">${registrationCode}</span>
      </p>
    </div>
    <div class="footer">
      <p>You received this email because you participated in ${eventTitle}. This is a one-time feedback request.<br>
      Connected Steps · Bangalore</p>
    </div>
  </div>
</body>
</html>`,
  };
}

function buildReminderEmail(params: {
  participantName: string;
  registrationCode: string;
  eventTitle: string;
}): { subject: string; html: string } {
  const { participantName, registrationCode, eventTitle } = params;
  const feedbackUrl = `${APP_BASE_URL}/it-run/feedback?code=${encodeURIComponent(registrationCode)}`;
  const name = participantName || "Runner";

  return {
    subject: `Quick reminder — your feedback on ${eventTitle}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Feedback reminder</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .wrap { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background: #333; padding: 24px 32px; }
    .header h1 { color: #fff; font-size: 18px; margin: 0; font-weight: 700; }
    .body { padding: 28px 32px; }
    .body p { color: #444; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .btn { display: inline-block; padding: 12px 28px; background: #e8620a; color: #fff !important;
           text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; margin: 8px 0; }
    .footer { padding: 18px 32px; border-top: 1px solid #f0f0f0; }
    .footer p { color: #999; font-size: 12px; margin: 0; line-height: 1.5; }
    .code { font-family: monospace; background: #f5f5f5; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>A quick reminder 🏃</h1>
    </div>
    <div class="body">
      <p>Hi ${name},</p>
      <p>We noticed you haven't shared your feedback on <strong>${eventTitle}</strong> yet. It takes under 2 minutes and directly shapes our next event.</p>
      <p>
        <a class="btn" href="${feedbackUrl}">Share Feedback Now</a>
      </p>
      <p style="font-size: 13px; color: #888;">
        Your registration code: <span class="code">${registrationCode}</span>
      </p>
    </div>
    <div class="footer">
      <p>This is the last reminder we'll send. Connected Steps · Bangalore</p>
    </div>
  </div>
</body>
</html>`,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today      = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const jobName    = "send-feedback-invitations";
  const nowMs      = Date.now();

  // Acquire daily lock — one run per calendar day (UTC)
  const locked = await acquireCronLock(jobName, today);
  if (!locked) {
    return NextResponse.json({ msg: "already_ran_today", date: today });
  }

  const db  = getSupabaseServer();
  const log: string[] = [];
  let   sent = 0;
  let   errors = 0;

  try {
    // ── Step 1: Find IT Run events completed in the last 48h ──────────────
    // "Completed" = event_date has passed (using IST midnight interpretation)
    // We look for events where event_date was yesterday or today
    // but only within the INITIAL_WINDOW_MS window.

    const windowStart = new Date(nowMs - INITIAL_WINDOW_MS).toISOString().slice(0, 10);
    const windowEnd   = new Date(nowMs).toISOString().slice(0, 10);

    const { data: rawEvents } = await db
      .from("it_run_events")
      .select("id, title, event_date")
      .gte("event_date", windowStart)
      .lte("event_date", windowEnd)
      .order("event_date");

    const events = (rawEvents ?? []) as { id: string; title: string; event_date: string }[];

    log.push(`events in window [${windowStart}..${windowEnd}]: ${events.length}`);

    for (const event of events) {
      if (sent >= MAX_SENDS_PER_RUN) { log.push("max sends reached, stopping"); break; }

      // Check event is actually completed (event_date + 23:59 IST has passed + INITIAL_DELAY_MS)
      const endOfDayMs   = new Date(`${event.event_date}T23:59:59+05:30`).getTime();
      const sendAfterMs  = endOfDayMs + INITIAL_DELAY_MS;

      if (nowMs < sendAfterMs) {
        log.push(`${event.id}: too soon, sendAfter=${new Date(sendAfterMs).toISOString()}`);
        continue;
      }

      log.push(`processing event: ${event.title} (${event.event_date})`);

      // ── Step 2: Fetch all paid/free non-cancelled registrations ──────────
      const { data: rawRegs } = await db
        .from("it_run_registrations")
        .select("id, registration_code, lead_email, participant_count")
        .eq("event_id", event.id)
        .in("payment_status", ["paid", "free"])
        .neq("registration_status", "cancelled");

      const regs = (rawRegs ?? []) as { id: string; registration_code: string; lead_email: string; participant_count: number }[];

      log.push(`  registrations: ${regs.length}`);

      for (const reg of regs ?? []) {
        if (sent >= MAX_SENDS_PER_RUN) break;

        // Get participant name (first participant in registration)
        const { data: firstPart } = await db
          .from("it_run_participants")
          .select("first_name, last_name")
          .eq("registration_id", reg.id)
          .order("created_at")
          .limit(1)
          .maybeSingle();

        const participantName = firstPart
          ? `${firstPart.first_name} ${firstPart.last_name}`.trim()
          : "";

        // ── Check for initial invite ────────────────────────────────────
        const { data: rawInitial } = await db
          .from("event_feedback_invitations")
          .select("id, sent_at, feedback_submitted, send_status")
          .eq("it_run_event_id", event.id)
          .eq("email", reg.lead_email.toLowerCase())
          .eq("channel", "email")
          .eq("invite_type", "initial")
          .maybeSingle();
        const existingInitial = rawInitial as { id: string; sent_at: string | null; feedback_submitted: boolean; send_status: string } | null;

        if (!existingInitial) {
          // Send initial invite
          const { subject, html } = buildInitialInviteEmail({
            participantName,
            registrationCode: reg.registration_code,
            eventTitle:       event.title,
            eventDate:        event.event_date,
          });

          // Insert invitation record first (idempotency)
          const { data: invRow } = await db
            .from("event_feedback_invitations")
            .insert({
              it_run_event_id:   event.id,
              email:             reg.lead_email.toLowerCase(),
              participant_name:  participantName || null,
              registration_code: reg.registration_code,
              channel:           "email",
              invite_type:       "initial",
              send_status:       "pending",
            })
            .select("id")
            .single();

          try {
            await sendSingleEmail({
              to:      reg.lead_email,
              subject,
              html,
              from:    `${FROM_NAME} <${FROM_EMAIL}>`,
            });

            if (invRow?.id) {
              await db
                .from("event_feedback_invitations")
                .update({ send_status: "sent", sent_at: new Date().toISOString() })
                .eq("id", invRow.id);
            }
            sent++;
            log.push(`  ✓ initial invite → ${reg.lead_email}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (invRow?.id) {
              await db
                .from("event_feedback_invitations")
                .update({ send_status: "failed", error_message: msg })
                .eq("id", invRow.id);
            }
            errors++;
            log.push(`  ✗ initial invite → ${reg.lead_email}: ${msg}`);
          }
          continue;
        }

        // ── Initial invite was sent — check if reminder is due ──────────
        if (
          existingInitial.send_status === "sent" &&
          !existingInitial.feedback_submitted &&
          existingInitial.sent_at
        ) {
          const sentMs      = new Date(existingInitial.sent_at).getTime();
          const reminderDue = sentMs + REMINDER_AFTER_MS;

          if (nowMs < reminderDue) continue; // not yet time for reminder

          // Check for already-sent reminder
          const { data: existingReminder } = await db
            .from("event_feedback_invitations")
            .select("id")
            .eq("it_run_event_id", event.id)
            .eq("email", reg.lead_email.toLowerCase())
            .eq("channel", "email")
            .eq("invite_type", "reminder")
            .maybeSingle();

          if (existingReminder) continue; // reminder already sent

          // Check if feedback was submitted since we last checked
          const { data: fbRow } = await db
            .from("event_feedback")
            .select("id")
            .eq("it_run_event_id", event.id)
            .eq("submitter_email", reg.lead_email.toLowerCase())
            .maybeSingle();

          if (fbRow) {
            // Mark initial invite as feedback_submitted
            await db
              .from("event_feedback_invitations")
              .update({ feedback_submitted: true })
              .eq("id", existingInitial.id);
            continue;
          }

          // Send reminder
          const { subject, html } = buildReminderEmail({
            participantName,
            registrationCode: reg.registration_code,
            eventTitle:       event.title,
          });

          const { data: remRow } = await db
            .from("event_feedback_invitations")
            .insert({
              it_run_event_id:   event.id,
              email:             reg.lead_email.toLowerCase(),
              participant_name:  participantName || null,
              registration_code: reg.registration_code,
              channel:           "email",
              invite_type:       "reminder",
              send_status:       "pending",
            })
            .select("id")
            .single();

          try {
            await sendSingleEmail({
              to:      reg.lead_email,
              subject,
              html,
              from:    `${FROM_NAME} <${FROM_EMAIL}>`,
            });

            if (remRow?.id) {
              await db
                .from("event_feedback_invitations")
                .update({ send_status: "sent", sent_at: new Date().toISOString() })
                .eq("id", remRow.id);
            }
            sent++;
            log.push(`  ✓ reminder → ${reg.lead_email}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (remRow?.id) {
              await db
                .from("event_feedback_invitations")
                .update({ send_status: "failed", error_message: msg })
                .eq("id", remRow.id);
            }
            errors++;
            log.push(`  ✗ reminder → ${reg.lead_email}: ${msg}`);
          }
        }
      }
    }

    return NextResponse.json({
      ok:     true,
      sent,
      errors,
      date:   today,
      log,
    });
  } catch (err) {
    // Release lock on unexpected error so Vercel retry can re-run
    await releaseCronLock(jobName, today);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-feedback-invitations] fatal error", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
