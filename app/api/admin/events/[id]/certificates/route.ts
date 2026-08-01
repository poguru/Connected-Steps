import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { generateCertificateHTML } from "@/lib/certificate-generator";
import { enqueueJob } from "@/lib/job-queue";

import { APP_URL } from "@/lib/config";
type Params = { params: Promise<{ id: string }> };

const BUCKET = "event-certificates";

// POST /api/admin/events/[id]/certificates
// Generates and stores certificates for all finishers.
//
// Body:
//   send_email  boolean  if true, also email each certificate (default false)
//   force       boolean  regenerate even if already generated (default false)

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body       = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sendEmail  = body.send_email === true;
  const force      = body.force      === true;

  const db = getSupabaseServer();

  // Fetch event details
  const { data: ev } = await db
    .from("events")
    .select("title, start_date, location")
    .eq("id", eventId)
    .single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Fetch all finisher results with registration info
  let q = db
    .from("event_results")
    .select(`
      id, user_email, user_name, distance_category,
      finish_time, pace, overall_position, category_position, status,
      registration_code,
      event_registrations!event_results_registration_id_fkey(
        id, certificate_url, certificate_generated_at
      )
    `)
    .eq("event_id", eventId)
    .eq("status", "finisher");

  if (!force) q = q.is("event_registrations.certificate_generated_at", null) as typeof q;

  const { data: results, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const finishers = (results as unknown as Array<{
    id:                string;
    user_email:        string;
    user_name:         string;
    distance_category: string | null;
    finish_time:       string | null;
    pace:              string | null;
    overall_position:  number | null;
    category_position: number | null;
    status:            string;
    registration_code: string | null;
    event_registrations: { id: string; certificate_url: string | null; certificate_generated_at: string | null } | null;
  }>) ?? [];

  const appUrl = APP_URL;
  let generated = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  for (const r of finishers) {
    const regId   = r.event_registrations?.id ?? null;
    const regCode = r.registration_code ?? r.user_email.split("@")[0].toUpperCase();

    try {
      // Generate HTML certificate
      const html = generateCertificateHTML({
        participantName:   r.user_name,
        eventTitle:        ev.title,
        eventDate:         ev.start_date,
        eventLocation:     ev.location,
        distance:          r.distance_category ?? "Event",
        finishTime:        r.finish_time ?? undefined,
        pace:              r.pace ?? undefined,
        overallPosition:   r.overall_position ?? undefined,
        categoryPosition:  r.category_position ?? undefined,
        status:            r.status,
        registrationCode:  regCode,
        appUrl,
      });

      const filePath  = `${eventId}/${regCode}.html`;
      const fileBytes = Buffer.from(html, "utf-8");

      // Upload to Supabase Storage
      const { error: uploadErr } = await db.storage
        .from(BUCKET)
        .upload(filePath, fileBytes, { contentType: "text/html; charset=utf-8", upsert: true });

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      // Get signed URL (365-day expiry)
      const { data: signedData } = await db.storage
        .from(BUCKET)
        .createSignedUrl(filePath, 365 * 24 * 3600);

      const certUrl = signedData?.signedUrl ?? `${appUrl}/api/admin/events/${eventId}/certificates/${regCode}`;

      // Update event_registrations if we have the reg ID
      if (regId) {
        await db.from("event_registrations").update({
          certificate_url:          certUrl,
          certificate_generated_at: new Date().toISOString(),
        }).eq("id", regId);
      }

      // Optionally email the certificate
      if (sendEmail) {
        await enqueueJob("certificate_generate", {
          userEmail:  r.user_email,
          userName:   r.user_name,
          eventId,
          eventTitle: ev.title,
          finishTime: r.finish_time ?? undefined,
        }, { idempotencyKey: `cert-email:${eventId}:${r.user_email}` });
      }

      generated++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[certificates] failed for ${r.user_email}: ${msg}`);
      errors.push(`${r.user_email}: ${msg.slice(0, 100)}`);
      failed++;
    }
  }

  console.log(`[certificates] event=${eventId} generated=${generated} skipped=${skipped} failed=${failed}`);

  return NextResponse.json({ generated, skipped, failed, errors: errors.slice(0, 10), email_queued: sendEmail && generated > 0 });
}

// GET /api/admin/events/[id]/certificates
// Returns certificate generation status for an event.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const [resultsRes, certsRes] = await Promise.all([
    db.from("event_results").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "finisher"),
    db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).not("certificate_generated_at", "is", null),
  ]);

  return NextResponse.json({
    total_finishers:  resultsRes.count ?? 0,
    certificates_generated: certsRes.count ?? 0,
  });
}
