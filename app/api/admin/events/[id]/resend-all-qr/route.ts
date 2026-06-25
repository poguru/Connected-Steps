import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML } from "@/lib/notify";

const BATCH_SIZE  = 10;    // emails per batch
const BATCH_PAUSE = 1200;  // ms between batches (stays under 10/s Resend limit)

type RegRow = {
  id: string; registration_code: string; user_email: string; user_name: string;
  distance_category: string | null;
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
  batch_id:        string;
};

// POST /api/admin/events/[id]/resend-all-qr
// Sends QR emails in batches with full per-recipient logging.
// Returns detailed results including per-email status and error reasons.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const body = await req.json().catch(() => ({})) as { retry_failed?: boolean; batch_id?: string };
  const retryMode = body.retry_failed === true;

  const db      = getSupabaseServer();
  const batchId = body.batch_id ?? `batch_${Date.now()}`;
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

  // ── 1. Fetch registrations ─────────────────────────────────────────────────
  let query = db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, distance_category, events(title, start_date, start_time, location)")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .neq("payment_status", "pending");

  if (retryMode) {
    // Only fetch registrations that previously failed for this event
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!regs?.length) return NextResponse.json({ sent: 0, failed: 0, skipped: 0, total: 0, message: "No confirmed registrations found." });

  const rows = regs as unknown as RegRow[];

  // ── 2. Validate & deduplicate emails ──────────────────────────────────────
  const seen    = new Set<string>();
  const logs:   EmailLogRow[] = [];
  const toSend: RegRow[]      = [];

  for (const reg of rows) {
    const email = reg.user_email?.trim().toLowerCase();
    const isValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!email || !isValidEmail) {
      logs.push({ event_id: eventId, registration_id: reg.id, recipient_email: reg.user_email ?? "", recipient_name: reg.user_name, subject: "", status: "skipped", error_message: "Invalid or missing email address", batch_id: batchId });
      continue;
    }
    if (seen.has(email)) {
      logs.push({ event_id: eventId, registration_id: reg.id, recipient_email: email, recipient_name: reg.user_name, subject: "", status: "skipped", error_message: "Duplicate email address", batch_id: batchId });
      continue;
    }
    seen.add(email);
    toSend.push(reg);
  }

  // ── 3. Send in batches ────────────────────────────────────────────────────
  let sent = 0, failed = 0;

  for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
    const chunk = toSend.slice(i, i + BATCH_SIZE);

    for (const reg of chunk) {
      const ev      = reg.events;
      const subject = `Your QR Code — ${ev?.title ?? "Connected Steps Event"}`;
      let status: "sent" | "failed" = "failed";
      let errorMsg: string | null    = null;

      try {
        const qrToken   = signEventQR(reg.registration_code, eventId);
        await db.from("event_registrations").update({ qr_token: qrToken }).eq("id", reg.id);

        const result = await sendEmail(
          reg.user_email,
          reg.user_name,
          subject,
          eventRegistrationEmailHTML({
            name:             reg.user_name,
            eventTitle:       ev?.title        ?? "Connected Steps Event",
            startDate:        ev?.start_date   ?? "",
            startTime:        ev?.start_time   ?? null,
            location:         ev?.location     ?? "",
            registrationCode: reg.registration_code,
            distanceCategory: reg.distance_category,
            qrToken,
          }),
        );

        if (result.ok) {
          status = "sent";
          sent++;
        } else {
          errorMsg = result.error ?? "Unknown provider error";
          failed++;
          console.error(`[resend-all-qr] FAILED to=${reg.user_email} batch=${batchId}:`, errorMsg);
        }
      } catch (e: unknown) {
        errorMsg = e instanceof Error ? e.message : String(e);
        failed++;
        console.error(`[resend-all-qr] EXCEPTION to=${reg.user_email}:`, errorMsg);
      }

      logs.push({ event_id: eventId, registration_id: reg.id, recipient_email: reg.user_email, recipient_name: reg.user_name, subject, status, error_message: errorMsg, batch_id: batchId });
    }

    // Pause between batches to respect provider rate limits
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
    sent,
    failed,
    skipped,
    total: rows.length,
    details: logs.map(l => ({
      email:  l.recipient_email,
      name:   l.recipient_name,
      status: l.status,
      reason: l.error_message,
    })),
  });
}

// GET /api/admin/events/[id]/resend-all-qr
// Returns email logs for this event so the UI can show history and retry.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("email_logs")
    .select("id, recipient_email, recipient_name, status, error_message, sent_at, batch_id, retry_count")
    .eq("event_id", eventId)
    .order("sent_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = {
    sent:    (data ?? []).filter(l => l.status === "sent").length,
    failed:  (data ?? []).filter(l => l.status === "failed").length,
    skipped: (data ?? []).filter(l => l.status === "skipped").length,
  };

  return NextResponse.json({ logs: data ?? [], summary });
}
