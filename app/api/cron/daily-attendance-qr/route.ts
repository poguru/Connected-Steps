// Cron: runs once daily at 23:30 UTC = 05:00 IST.
// Checks DB for configured generation_time and generates exactly once per day.
// The 55-minute isWithinGenerationWindow window starts at the configured time (default 05:00 IST).
//
// vercel.json: { "path": "/api/cron/daily-attendance-qr", "schedule": "30 23 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import {
  generateDailyAttendanceQR,
  sendDailyQREmails,
  getQRSettings,
  createRunLog,
  updateRunLog,
  sendQRFailureAlert,
  todayIST,
} from "@/lib/daily-attendance-qr";
import { getSupabaseServer } from "@/lib/supabase-server";

const JOB_NAME      = "daily-attendance-qr";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function currentISTTimeHHMM(): string {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const h   = String(now.getUTCHours()).padStart(2, "0");
  const m   = String(now.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function isWithinGenerationWindow(configuredTime: string): boolean {
  const [ch, cm] = configuredTime.split(":").map(Number);
  const configMinutes = ch * 60 + cm;
  const nowIST        = new Date(Date.now() + IST_OFFSET_MS);
  const nowMinutes    = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();
  const diff          = nowMinutes - configMinutes;
  return diff >= 0 && diff < 55;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = todayIST();
  const db    = getSupabaseServer();

  const settings = await getQRSettings(null);

  if (!settings.auto_generate_enabled) {
    return NextResponse.json({ skipped: true, reason: "auto_generate disabled" });
  }

  if (!isWithinGenerationWindow(settings.generation_time)) {
    const currentTime = currentISTTimeHHMM();
    return NextResponse.json({
      skipped: true,
      reason:  `Not yet. Current IST=${currentTime}, configured=${settings.generation_time}`,
    });
  }

  // Acquire idempotency lock — prevents double-generation if cron fires multiple times
  const locked = await acquireCronLock(JOB_NAME, today);
  if (!locked) {
    return NextResponse.json({ skipped: true, reason: "Already ran today" });
  }

  // Create execution log row (non-fatal if it fails)
  const logId = await createRunLog({ executionDate: today, triggeredBy: "cron" });

  try {
    const generated = await generateDailyAttendanceQR({
      locationId:      null,
      generatedBy:     "cron",
      validityMinutes: settings.validity_minutes,
      forDate:         today,
    });

    let emailResult = { sent: 0, failed: 0 };
    if (settings.auto_email_enabled) {
      emailResult = await sendDailyQREmails({
        qrId:        generated.qrId,
        qrBase64:    generated.qrBase64,
        date:        generated.date,
        generatedAt: new Date().toISOString(),
        expiresAt:   generated.expiresAt,
        locationId:  null,
      });
    }

    // Determine outcome
    const hasEmailFailures = emailResult.failed > 0;
    const status = !settings.auto_email_enabled
      ? "success"
      : emailResult.sent === 0 && emailResult.failed > 0
        ? "failed"
        : emailResult.failed > 0
          ? "partial"
          : "success";

    // Persist outcome to execution log
    await updateRunLog(logId, {
      status,
      qrId:         generated.qrId,
      emailsSent:   emailResult.sent,
      emailsFailed: emailResult.failed,
    });

    // Audit log (best-effort)
    await db.from("audit_logs").insert({
      action:       "daily_qr_generated",
      entity_type:  "daily_attendance_qr",
      entity_id:    generated.qrId,
      performed_by: "cron",
      metadata: {
        date:          generated.date,
        expires_at:    generated.expiresAt,
        emails_sent:   emailResult.sent,
        emails_failed: emailResult.failed,
      },
    }).maybeSingle();

    // Alert admin on any email failures
    if (hasEmailFailures) {
      console.error(
        `[daily-attendance-qr] ${emailResult.failed} email(s) failed for ${today}` +
        ` (sent: ${emailResult.sent})`,
      );
      await sendQRFailureAlert({
        date:         today,
        emailsSent:   emailResult.sent,
        emailsFailed: emailResult.failed,
        triggeredBy:  "cron",
      });
    }

    return NextResponse.json({
      ok:           true,
      date:         generated.date,
      qrId:         generated.qrId,
      expiresAt:    generated.expiresAt,
      emailsSent:   emailResult.sent,
      emailsFailed: emailResult.failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[daily-attendance-qr] Generation failed:", err);

    await updateRunLog(logId, {
      status:       "failed",
      errorMessage: message,
    });

    // Alert admin that the cron itself crashed
    await sendQRFailureAlert({
      date:         today,
      emailsSent:   0,
      emailsFailed: 0,
      triggeredBy:  "cron",
      errorSample:  message,
    });

    // Release lock so next invocation (or manual retry) can succeed
    await releaseCronLock(JOB_NAME, today);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
