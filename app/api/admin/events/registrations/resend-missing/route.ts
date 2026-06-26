import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { handleEventQrEmail } from "@/lib/job-handlers";

// POST /api/admin/events/registrations/resend-missing
//
// Sends (or re-sends) the registration confirmation email to all confirmed
// registrations that are missing a successful delivery.
//
// Body:
//   event_id  string   optional — limits resend to one event
//   force     boolean  optional — resend even to registrations that already
//                      have a sent email (use for "resend to all" scenarios)
//   dry_run   boolean  optional — preview what would be sent without sending
//
// Response:
//   { sent, skipped, failed, errors[], dry_run }

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body    = await req.json().catch(() => ({})) as Record<string, unknown>;
  const eventId = (body.event_id as string | null) ?? null;
  const force   = body.force   === true;
  const dryRun  = body.dry_run === true;

  const db = getSupabaseServer();

  // Find all confirmed registrations that need an email.
  // Filters (eq, is) must be applied BEFORE order/limit in Supabase PostgREST.
  let q = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      event_id, distance_category, email_status,
      confirmation_email_sent_at, qr_token,
      events ( title, start_date, start_time, location )
    `)
    .eq("status", "confirmed");

  if (eventId) q = q.eq("event_id", eventId) as typeof q;

  // When force=false (default): only send to registrations with no successful delivery
  if (!force) q = q.is("confirmation_email_sent_at", null) as typeof q;

  q = q.order("created_at", { ascending: true }).limit(500) as typeof q;

  const { data: registrations, error: fetchErr } = await q;
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const targets = (registrations ?? []) as Array<{
    id:                         string;
    registration_code:          string;
    user_email:                 string;
    user_name:                  string;
    event_id:                   string;
    distance_category:          string | null;
    email_status:               string | null;
    confirmation_email_sent_at: string | null;
    qr_token:                   string | null;
    events:                     { title: string; start_date: string; start_time: string | null; location: string } | null;
  }>;

  if (dryRun) {
    return NextResponse.json({
      dry_run:  true,
      would_send: targets.length,
      targets:    targets.map(r => ({
        id:                r.id,
        registration_code: r.registration_code,
        user_email:        r.user_email,
        email_status:      r.email_status,
        has_qr:            !!r.qr_token,
      })),
    });
  }

  let sent = 0, skipped = 0, failed = 0;
  const errors: { id: string; email: string; error: string }[] = [];

  for (const reg of targets) {
    // Skip if already successfully sent and force=false
    if (!force && reg.confirmation_email_sent_at) {
      skipped++;
      continue;
    }

    const ev = reg.events;

    try {
      await handleEventQrEmail({
        registrationId:   reg.id,
        registrationCode: reg.registration_code,
        eventId:          reg.event_id,
        userEmail:        reg.user_email,
        userName:         reg.user_name,
        eventTitle:       ev?.title       ?? "Connected Steps Event",
        startDate:        ev?.start_date  ?? "",
        startTime:        ev?.start_time  ?? null,
        location:         ev?.location    ?? "",
        distanceCategory: reg.distance_category,
      });
      sent++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[resend-missing] failed reg=${reg.id} email=${reg.user_email}: ${msg}`);
      errors.push({ id: reg.id, email: reg.user_email, error: msg });
      failed++;
    }

    // 500 ms pause between emails to avoid SES rate-limit (14 emails/second max)
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[resend-missing] complete sent=${sent} skipped=${skipped} failed=${failed} event=${eventId ?? "all"}`);

  return NextResponse.json({ sent, skipped, failed, errors, dry_run: false });
}
