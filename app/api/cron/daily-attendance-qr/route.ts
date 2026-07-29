// Cron: runs at 22:30, 23:30, 0:30, 1:30, 2:30 UTC  (= 4:00, 5:00, 6:00, 7:00, 8:00 IST)
// Checks DB for configured generation_time and generates exactly once per day.
//
// vercel.json entries:
//   { "path": "/api/cron/daily-attendance-qr", "schedule": "30 22,23,0,1,2 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import {
  generateDailyAttendanceQR,
  sendDailyQREmails,
  getQRSettings,
  todayIST,
} from "@/lib/daily-attendance-qr";
import { getSupabaseServer } from "@/lib/supabase-server";

const JOB_NAME     = "daily-attendance-qr";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function currentISTTimeHHMM(): string {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const h   = String(now.getUTCHours()).padStart(2, "0");
  const m   = String(now.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Returns true if current IST time is within the 55-minute window after the configured time.
// The cron fires every hour so we give a 55-min window to avoid missing the slot.
function isWithinGenerationWindow(configuredTime: string): boolean {
  const [ch, cm] = configuredTime.split(":").map(Number);
  const configMinutes = ch * 60 + cm;

  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const nowMinutes = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();

  const diff = nowMinutes - configMinutes;
  return diff >= 0 && diff < 55;
}

export async function GET(req: NextRequest) {
  // Vercel cron auth
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayIST();
  const db    = getSupabaseServer();

  // Check global settings (and per-location settings in future phases)
  const settings = await getQRSettings(null);

  if (!settings.auto_generate_enabled) {
    return NextResponse.json({ skipped: true, reason: "auto_generate disabled" });
  }

  // Is it time?
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

    // Audit log
    await db.from("audit_logs").insert({
      action:      "daily_qr_generated",
      entity_type: "daily_attendance_qr",
      entity_id:   generated.qrId,
      performed_by: "cron",
      metadata: {
        date:         generated.date,
        expires_at:   generated.expiresAt,
        emails_sent:  emailResult.sent,
        emails_failed: emailResult.failed,
      },
    }).maybeSingle();

    // Alert admin on email failures
    if (emailResult.failed > 0 && emailResult.sent === 0) {
      console.error(`[daily-attendance-qr] All ${emailResult.failed} emails failed for ${today}`);
    }

    return NextResponse.json({
      ok:          true,
      date:        generated.date,
      qrId:        generated.qrId,
      expiresAt:   generated.expiresAt,
      emailsSent:  emailResult.sent,
      emailsFailed: emailResult.failed,
    });
  } catch (err) {
    // Release lock on failure so the next cron invocation can retry
    await releaseCronLock(JOB_NAME, today);
    console.error("[daily-attendance-qr] Generation failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
