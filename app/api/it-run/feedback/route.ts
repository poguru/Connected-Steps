import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";

// Whitelist of valid improvement area tags
const VALID_IMPROVEMENT_AREAS = new Set([
  "registration",
  "water_stations",
  "route_marking",
  "tshirts",
  "checkin",
  "bag_drop",
  "finish_line",
  "bib_collection",
  "parking",
  "timing",
  "medal",
  "certificate",
  "refreshments",
  "support_staff",
  "communication",
  "safety",
  "medical",
  "photography",
  "other",
]);

// Maximum comment length
const MAX_COMMENT_LENGTH = 2000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Lookup it_run_event and registration by registration code. Returns null on any mismatch. */
async function lookupRegistration(db: ReturnType<typeof getSupabaseServer>, code: string) {
  const { data: reg } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, payment_status,
      registration_status,
      it_run_events ( id, title, event_date, slug )
    `)
    .eq("registration_code", code.trim().toUpperCase())
    .single<{
      id: string;
      registration_code: string;
      lead_email: string;
      payment_status: string;
      registration_status: string | null;
      it_run_events: { id: string; title: string; event_date: string; slug: string } | null;
    }>();
  return reg ?? null;
}

/** Determine if an IT Run event is completed (event_date is in the past — IST midnight). */
function isItRunEventCompleted(eventDate: string): boolean {
  // event_date is "YYYY-MM-DD" in IST. Event is completed after IST end-of-day.
  const endOfDayIst = new Date(`${eventDate}T23:59:59+05:30`).getTime();
  return Date.now() > endOfDayIst;
}

/** Strip and sanitize comment text. */
function sanitizeComment(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")   // strip HTML tags
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
}

// ── GET /api/it-run/feedback?code=ITRUN2-XXXXXXXX ────────────────────────────
// Returns the caller's previously submitted feedback for the event associated
// with the given registration code. Returns { feedback: null } if not submitted.

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const reg = await lookupRegistration(db, code);
  if (!reg || !reg.it_run_events) {
    return NextResponse.json({ error: "Invalid registration code" }, { status: 400 });
  }

  const { data: existing } = await db
    .from("event_feedback")
    .select(
      "id, overall_rating, organisation_rating, route_rating, support_rating, " +
      "comment, would_recommend, nps_score, improvement_areas, created_at"
    )
    .eq("it_run_event_id", reg.it_run_events.id)
    .eq("submitter_email", reg.lead_email.toLowerCase())
    .maybeSingle();

  return NextResponse.json({ feedback: existing ?? null });
}

// ── POST /api/it-run/feedback ─────────────────────────────────────────────────
// Submit feedback for an IT Run registration.
//
// Body: {
//   registration_code  string  required
//   overall_rating     1-5     required
//   organisation_rating 1-5   optional
//   route_rating       1-5    optional
//   support_rating     1-5    optional
//   comment            string optional (max 2000 chars)
//   would_recommend    boolean optional
//   nps_score          0-10   optional
//   improvement_areas  string[] optional (whitelist validated)
// }
//
// Gates:
//   1. Event must be completed (event_date has passed in IST)
//   2. registration_code must be valid
//   3. payment_status must be 'paid' or 'free'
//   4. registration_status must not be 'cancelled'
//   5. Not already submitted → 409 with existing feedback
//   6. Rate limit: 3 req/min/IP

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = getClientIp(req);
  const rl = await checkAndRecordEndpointLimit(`itr:feedback:${ip}`, 3, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    registration_code,
    overall_rating,
    organisation_rating,
    route_rating,
    support_rating,
    comment,
    would_recommend,
    nps_score,
    improvement_areas,
  } = body;

  // ── Validate registration_code ────────────────────────────────────────────
  if (!registration_code || typeof registration_code !== "string") {
    return NextResponse.json({ error: "registration_code is required" }, { status: 400 });
  }

  // ── Validate overall_rating ───────────────────────────────────────────────
  if (
    overall_rating === undefined ||
    typeof overall_rating !== "number" ||
    !Number.isInteger(overall_rating) ||
    overall_rating < 1 ||
    overall_rating > 5
  ) {
    return NextResponse.json(
      { error: "overall_rating must be an integer between 1 and 5" },
      { status: 400 }
    );
  }

  // ── Validate optional ratings ─────────────────────────────────────────────
  for (const [field, val] of [
    ["organisation_rating", organisation_rating],
    ["route_rating", route_rating],
    ["support_rating", support_rating],
  ] as [string, unknown][]) {
    if (val !== undefined && val !== null) {
      if (typeof val !== "number" || !Number.isInteger(val) || (val as number) < 1 || (val as number) > 5) {
        return NextResponse.json(
          { error: `${field} must be an integer between 1 and 5` },
          { status: 400 }
        );
      }
    }
  }

  // ── Validate NPS ──────────────────────────────────────────────────────────
  if (nps_score !== undefined && nps_score !== null) {
    if (
      typeof nps_score !== "number" ||
      !Number.isInteger(nps_score) ||
      nps_score < 0 ||
      nps_score > 10
    ) {
      return NextResponse.json(
        { error: "nps_score must be an integer between 0 and 10" },
        { status: 400 }
      );
    }
  }

  // ── Validate improvement_areas ────────────────────────────────────────────
  const areas: string[] = [];
  if (improvement_areas !== undefined && improvement_areas !== null) {
    if (!Array.isArray(improvement_areas)) {
      return NextResponse.json({ error: "improvement_areas must be an array" }, { status: 400 });
    }
    for (const a of improvement_areas) {
      if (typeof a !== "string") {
        return NextResponse.json({ error: "improvement_areas must contain strings" }, { status: 400 });
      }
      if (!VALID_IMPROVEMENT_AREAS.has(a)) {
        return NextResponse.json(
          { error: `Invalid improvement area: ${a}` },
          { status: 400 }
        );
      }
      areas.push(a);
    }
  }

  // ── Validate comment length ───────────────────────────────────────────────
  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return NextResponse.json({ error: "comment must be a string" }, { status: 400 });
  }

  // ── DB lookups ────────────────────────────────────────────────────────────
  const db = getSupabaseServer();
  const reg = await lookupRegistration(db, registration_code as string);

  if (!reg || !reg.it_run_events) {
    return NextResponse.json({ error: "Invalid registration code" }, { status: 400 });
  }

  // Gate 1: Event must be completed
  if (!isItRunEventCompleted(reg.it_run_events.event_date)) {
    return NextResponse.json(
      { error: "Feedback opens after the event ends" },
      { status: 403 }
    );
  }

  // Gate 2: Must be paid or free
  if (reg.payment_status !== "paid" && reg.payment_status !== "free") {
    return NextResponse.json(
      { error: "Feedback is only available for confirmed registrations" },
      { status: 403 }
    );
  }

  // Gate 3: Must not be cancelled
  if (reg.registration_status === "cancelled") {
    return NextResponse.json(
      { error: "This registration has been cancelled" },
      { status: 403 }
    );
  }

  // Gate 4: Check for duplicate submission
  const { data: existing } = await db
    .from("event_feedback")
    .select("id, overall_rating, comment, created_at")
    .eq("it_run_event_id", reg.it_run_events.id)
    .eq("submitter_email", reg.lead_email.toLowerCase())
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        already: true,
        feedback: {
          overall_rating: existing.overall_rating,
          comment: existing.comment,
          created_at: existing.created_at,
        },
      },
      { status: 409 }
    );
  }

  // ── Fetch first participant name for submitter_name ───────────────────────
  const { data: firstParticipant } = await db
    .from("it_run_participants")
    .select("id, first_name, last_name")
    .eq("registration_id", reg.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const submitterName = firstParticipant
    ? `${firstParticipant.first_name} ${firstParticipant.last_name}`.trim()
    : null;

  // ── Insert feedback ───────────────────────────────────────────────────────
  const { error: insertErr } = await db.from("event_feedback").insert({
    it_run_event_id:     reg.it_run_events.id,
    registration_code:   reg.registration_code,
    participant_id:      firstParticipant?.id ?? null,
    submitter_email:     reg.lead_email.toLowerCase(),
    submitter_name:      submitterName,
    overall_rating:      overall_rating as number,
    organisation_rating: (organisation_rating as number | undefined) ?? null,
    route_rating:        (route_rating as number | undefined) ?? null,
    support_rating:      (support_rating as number | undefined) ?? null,
    comment:             comment ? sanitizeComment(comment as string) : "",
    would_recommend:     typeof would_recommend === "boolean" ? would_recommend : null,
    nps_score:           (nps_score as number | undefined) ?? null,
    improvement_areas:   areas,
    is_flagged:          false,
    is_published:        true,
    issue_status:        "none",
  });

  if (insertErr) {
    // Handle race condition: duplicate (event_id, submitter_email) on concurrent submit
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { already: true, feedback: null },
        { status: 409 }
      );
    }
    console.error("[feedback] insert error", insertErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Mark invitation as feedback_submitted if one exists
  await db
    .from("event_feedback_invitations")
    .update({ feedback_submitted: true })
    .eq("it_run_event_id", reg.it_run_events.id)
    .eq("email", reg.lead_email.toLowerCase());

  return NextResponse.json({ success: true });
}
