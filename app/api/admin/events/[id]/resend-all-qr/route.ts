import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";

// SES Sandbox limit: 1 email/second. Production limit starts at 14/s and scales.
// Using 1 email per 1.1s is safe for Sandbox AND respects Resend's fallback limits.
const BATCH_SIZE  = 1;    // Send 1 at a time while SES is in Sandbox
const BATCH_PAUSE = 1100; // 1.1s between emails → stays under 1/s SES limit

type RegRow = {
  id: string; registration_code: string; user_email: string; user_name: string;
  distance_category: string | null; qr_token: string | null;
  events: { title: string; start_date: string; start_time: string | null; location: string } | null;
};

type EmailLogRow = {
  event_id:        string;
  registration_id: string;
  recipient_email: string;
  recipient_name:  string;
  subject:         string;
  status:          "sent" | "failed" | "skipped";
  error_message:   string | null;
  ses_message_id:  string | null;
  provider:        string | null;
  http_status:     number | null;
  batch_id:        string;
};

// POST /api/admin/events/[id]/resend-all-qr
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const body = await req.json().catch(() => ({})) as { retry_failed?: boolean; batch_id?: string };
  const retryMode = body.retry_failed === true;
  const batchId   = body.batch_id ?? `batch_${Date.now()}`;
  const db        = getSupabaseServer();

  // ── 1. Fetch registrations ─────────────────────────────────────────────────
  let query = db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, distance_category, qr_token, events(title, start_date, start_time, location)")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .neq("payment_status", "pending");

  if (retryMode) {
    const { data: failedLogs } = await db
      .from("email_logs")
      .select("registration_id")
      .eq("event_id", eventId)
      .eq("status", "failed");
    const failedIds = (failedLogs ?? []).map(l => l.registration_id).filter(Boolean);
    if (!failedIds.length) return NextResponse.json({ sent: 0, failed: 0, skipped: 0, total: 0, message: "No failed emails to retry." });
    query = query.in("id", failedIds);
  }

  const { data: regs, error } = await query;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!regs?.length) return NextResponse.json({ sent: 0, failed: 0, skipped: 0, total: 0, message: "No confirmed registrations found." });

  const rows = regs as unknown as RegRow[];

  // ── 2. Validate & deduplicate ──────────────────────────────────────────────
  const seen:   Set<string>   = new Set();
  const logs:   EmailLogRow[] = [];
  const toSend: RegRow[]      = [];

  for (const reg of rows) {
    const email = reg.user_email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      logs.push({ event_id: eventId, registration_id: reg.id, recipient_email: reg.user_email ?? "", recipient_name: reg.user_name, subject: "", status: "skipped", error_message: "Invalid or missing email", ses_message_id: null, provider: null, http_status: null, batch_id: batchId });
      continue;
    }
    // Deduplicate by registration ID, not by email.
    // A user can have multiple registrations (different categories, group bookings)
    // and each registration deserves its own QR email.
    if (seen.has(reg.id)) {
      logs.push({ event_id: eventId, registration_id: reg.id, recipient_email: email, recipient_name: reg.user_name, subject: "", status: "skipped", error_message: "Duplicate registration", ses_message_id: null, provider: null, http_status: null, batch_id: batchId });
      continue;
    }
    seen.add(reg.id);
    toSend.push(reg);
  }

  // ── 3. Send in batches ────────────────────────────────────────────────────
  let sent = 0, failed = 0;

  for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
    const chunk = toSend.slice(i, i + BATCH_SIZE);

    for (const reg of chunk) {
      const ev      = reg.events;
      const subject = `Your Registration & QR Code — ${ev?.title ?? "Connected Steps Event"}`;
      let status:     "sent" | "failed" = "failed";
      let errorMsg:   string | null      = null;
      let messageId:  string | null      = null;
      let provider:   string | null      = null;
      let httpStatus: number | null      = null;

      try {
        // Generate/refresh QR token (ensures every send has a valid token)
        const qrToken = signEventQR(reg.registration_code, eventId);

        // Store token if missing or refreshing
        if (!reg.qr_token || reg.qr_token !== qrToken) {
          await db.from("event_registrations").update({ qr_token: qrToken }).eq("id", reg.id);
        }

        const result = await sendEmail(
          reg.user_email,
          reg.user_name,
          subject,
          eventRegistrationEmailHTML({
            name:             reg.user_name,
            eventTitle:       ev?.title       ?? "Connected Steps Event",
            startDate:        ev?.start_date  ?? "",
            startTime:        ev?.start_time  ?? null,
            location:         ev?.location    ?? "",
            registrationCode: reg.registration_code,
            distanceCategory: reg.distance_category,
            qrToken,
          }),
          false, // isOtp
          true,  // isTransactional — bypass NON_OTP_EMAILS_DISABLED
        );

        if (result.ok) {
          status     = "sent";
          messageId  = result.messageId ?? null;
          provider   = result.provider  ?? null;
          httpStatus = result.httpStatus ?? null;
          sent++;
          console.log(`[resend-all-qr] ✅ sent to=${reg.user_email} msgId=${messageId} provider=${provider}`);
        } else {
          errorMsg   = result.error ?? "Unknown provider error";
          provider   = result.provider ?? null;
          httpStatus = result.httpStatus ?? null;
          failed++;
          console.error(`[resend-all-qr] ❌ FAILED to=${reg.user_email} provider=${provider} error=${errorMsg}`);
        }
      } catch (e: unknown) {
        errorMsg = e instanceof Error ? e.message : String(e);
        failed++;
        console.error(`[resend-all-qr] ❌ EXCEPTION to=${reg.user_email}:`, errorMsg);
      }

      logs.push({ event_id: eventId, registration_id: reg.id, recipient_email: reg.user_email, recipient_name: reg.user_name, subject, status, error_message: errorMsg, ses_message_id: messageId, provider, http_status: httpStatus, batch_id: batchId });
    }

    if (i + BATCH_SIZE < toSend.length) {
      await new Promise(r => setTimeout(r, BATCH_PAUSE));
    }
  }

  // ── 4. Persist logs ───────────────────────────────────────────────────────
  if (logs.length) {
    const { error: logErr } = await db.from("email_logs").insert(logs);
    if (logErr) console.error("[resend-all-qr] failed to write email_logs:", logErr.message);
  }

  const skipped = logs.filter(l => l.status === "skipped").length;

  return NextResponse.json({
    batch_id: batchId,
    sent, failed, skipped, total: rows.length,
    details: logs.map(l => ({
      email:      l.recipient_email,
      name:       l.recipient_name,
      status:     l.status,
      reason:     l.error_message,
      message_id: l.ses_message_id,
      provider:   l.provider,
    })),
  });
}

// GET — email history + summary for this event
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("email_logs")
    .select("id, recipient_email, recipient_name, status, error_message, ses_message_id, provider, http_status, sent_at, batch_id")
    .eq("event_id", eventId)
    .order("sent_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const summary = {
    sent:    (data ?? []).filter(l => l.status === "sent").length,
    failed:  (data ?? []).filter(l => l.status === "failed").length,
    skipped: (data ?? []).filter(l => l.status === "skipped").length,
  };

  return NextResponse.json({ logs: data ?? [], summary });
}
