import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/registrations/audit
// Audits event registrations to find users who are missing:
//   - QR code (qr_token IS NULL)
//   - Confirmation email (confirmation_email_sent_at IS NULL)
//   - Failed email (email_status = 'failed')
//
// Query params:
//   event_id  uuid   filter to one event (optional — omit for all events)
//   limit     int    max rows returned (default 200)
//
// Response shape is additive — new fields may be added without breaking callers.

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp      = req.nextUrl.searchParams;
  const eventId = sp.get("event_id") ?? null;
  const limit   = Math.min(500, Math.max(1, parseInt(sp.get("limit") ?? "200", 10)));

  const db = getSupabaseServer();

  // ── Confirmed registrations without a sent confirmation email ─────────────
  // These are the users who need to receive their QR code.
  let q = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      status, payment_status, email_status,
      qr_token, confirmation_email_sent_at, qr_generated_at,
      email_ses_message_id, created_at,
      events ( id, title, start_date )
    `)
    .eq("status", "confirmed")
    .is("confirmation_email_sent_at", null)   // no confirmation email ever sent
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventId) q = q.eq("event_id", eventId) as typeof q;

  // ── Failed emails (sent but bounced/rejected) ──────────────────────────────
  let qFailed = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      status, payment_status, email_status,
      qr_token, confirmation_email_sent_at, qr_generated_at,
      email_ses_message_id, created_at,
      events ( id, title, start_date )
    `)
    .eq("status", "confirmed")
    .eq("email_status", "failed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventId) qFailed = qFailed.eq("event_id", eventId) as typeof qFailed;

  // ── Missing QR (confirmed but no qr_token) ─────────────────────────────────
  let qNoQr = db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, status, email_status, created_at, events(title)")
    .eq("status", "confirmed")
    .is("qr_token", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventId) qNoQr = qNoQr.eq("event_id", eventId) as typeof qNoQr;

  const [missingEmailRes, failedEmailRes, noQrRes] = await Promise.all([q, qFailed, qNoQr]);

  return NextResponse.json({
    missing_confirmation_email: {
      count: (missingEmailRes.data ?? []).length,
      rows:  missingEmailRes.data ?? [],
    },
    failed_email: {
      count: (failedEmailRes.data ?? []).length,
      rows:  failedEmailRes.data ?? [],
    },
    missing_qr: {
      count: (noQrRes.data ?? []).length,
      rows:  noQrRes.data ?? [],
    },
    summary: {
      total_needing_resend: new Set([
        ...(missingEmailRes.data ?? []).map((r: { id: string }) => r.id),
        ...(failedEmailRes.data ?? []).map((r: { id: string }) => r.id),
      ]).size,
    },
  });
}
