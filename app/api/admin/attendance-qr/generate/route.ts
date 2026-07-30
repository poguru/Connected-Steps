import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  generateDailyAttendanceQR,
  sendDailyQREmails,
  getQRSettings,
  todayIST,
} from "@/lib/daily-attendance-qr";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/admin/attendance-qr/generate
// Body: { location_id?: string; send_email?: boolean; for_date?: string }
// Manually generates (or regenerates) a daily attendance QR.
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { location_id?: string; send_email?: boolean; for_date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body — expected JSON" }, { status: 400 });
  }

  try {
    const db         = getSupabaseServer();
    const locationId = body.location_id ?? null;
    const date       = body.for_date     ?? todayIST();
    const settings   = await getQRSettings(locationId);
    const adminEmail = req.headers.get("x-admin-email") ?? "admin";

    const generated = await generateDailyAttendanceQR({
      locationId,
      generatedBy:     adminEmail,
      validityMinutes: settings.validity_minutes,
      forDate:         date,
    });

    let emailResult = { sent: 0, failed: 0 };
    const sendEmail = body.send_email !== false;  // default true
    if (sendEmail) {
      emailResult = await sendDailyQREmails({
        qrId:        generated.qrId,
        qrBase64:    generated.qrBase64,
        date:        generated.date,
        generatedAt: new Date().toISOString(),
        expiresAt:   generated.expiresAt,
        locationId,
      });
    }

    // Audit log — intentionally outside try/catch; a logging failure must not
    // roll back a successful generation. Supabase client returns {data, error}
    // and never throws, so this is safe.
    await db.from("audit_logs").insert({
      action:       "daily_qr_generated",
      entity_type:  "daily_attendance_qr",
      entity_id:    generated.qrId,
      performed_by: adminEmail,
      metadata: {
        date:           generated.date,
        expires_at:     generated.expiresAt,
        trigger:        "manual",
        emails_sent:    emailResult.sent,
        emails_failed:  emailResult.failed,
      },
    }).maybeSingle();

    return NextResponse.json({
      ok:           true,
      qrId:         generated.qrId,
      date:         generated.date,
      expiresAt:    generated.expiresAt,
      qrDataUrl:    generated.qrDataUrl,
      emailsSent:   emailResult.sent,
      emailsFailed: emailResult.failed,
    });
  } catch (err) {
    console.error("[attendance-qr/generate]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
