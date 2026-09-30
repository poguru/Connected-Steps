import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getLifecycle } from "@/lib/event-lifecycle";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";

// ── Generic Event Feedback API ────────────────────────────────────────────────
// Reuses the event_feedback table (event_id column path, not it_run_event_id).
//
// GET  /api/events/[eventId]/feedback
//   Public aggregate (no PII). Optional ?email= for own feedback.
//
// POST /api/events/[eventId]/feedback
//   Submit feedback. Auth: registration_code in body.
//   Gates: event completed + paid/free + not cancelled + no duplicate.

const VALID_IMPROVEMENT_AREAS = new Set([
  "registration", "water_stations", "route_marking", "tshirts", "checkin",
  "bag_drop", "finish_line", "bib_collection", "parking", "timing", "medal",
  "certificate", "refreshments", "support_staff", "communication",
  "safety", "medical", "photography", "other",
]);

const MAX_COMMENT_LENGTH = 2000;

function sanitizeComment(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").trim().slice(0, MAX_COMMENT_LENGTH);
}

// ── GET — public aggregate ────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase() ?? null;

  const db = getSupabaseServer();

  const { data: event } = await db
    .from("events")
    .select("id, title, start_date, start_time, end_date, end_time, registration_closes_at, registration_opens_at")
    .eq("id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Only return feedback once event is completed
  const lifecycle = getLifecycle(event);
  if (!lifecycle.isCompleted) {
    return NextResponse.json({ error: "Feedback not yet available" }, { status: 403 });
  }

  type FeedbackPublicRow = {
    id: string;
    submitter_name: string | null;
    overall_rating: number;
    organisation_rating: number | null;
    route_rating: number | null;
    support_rating: number | null;
    comment: string;
    would_recommend: boolean | null;
    nps_score: number | null;
    improvement_areas: string[];
    submitter_email: string;
    created_at: string;
  };

  const { data: rawRows } = await db
    .from("event_feedback")
    .select(
      "id, submitter_name, overall_rating, organisation_rating, route_rating, " +
      "support_rating, comment, would_recommend, nps_score, improvement_areas, " +
      "submitter_email, created_at"
    )
    .eq("event_id", eventId)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const all = (rawRows ?? []) as unknown as FeedbackPublicRow[];

  // Find own feedback if email given
  const myFeedback = email ? (all.find(r => r.submitter_email === email) ?? null) : null;

  // Build aggregate
  const total = all.length;
  const avgOverall = total > 0
    ? Math.round((all.reduce((s, r) => s + r.overall_rating, 0) / total) * 10) / 10
    : null;

  // Strip emails from public list
  const feedback = all.map(({ submitter_email: _email, ...rest }) => rest);

  return NextResponse.json({
    feedback,
    total,
    avg_overall: avgOverall,
    myFeedback: myFeedback ? { ...myFeedback, submitter_email: undefined } : null,
  });
}

// ── POST — submit feedback ────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  // Rate limit
  const ip = getClientIp(req);
  const rl = await checkAndRecordEndpointLimit(`ev:feedback:${ip}`, 3, 60_000);
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

  // Validate registration_code
  if (!registration_code || typeof registration_code !== "string") {
    return NextResponse.json({ error: "registration_code is required" }, { status: 400 });
  }

  // Validate overall_rating
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

  for (const [field, val] of [
    ["organisation_rating", organisation_rating],
    ["route_rating", route_rating],
    ["support_rating", support_rating],
  ] as [string, unknown][]) {
    if (val !== undefined && val !== null) {
      if (typeof val !== "number" || !Number.isInteger(val) || (val as number) < 1 || (val as number) > 5) {
        return NextResponse.json({ error: `${field} must be between 1 and 5` }, { status: 400 });
      }
    }
  }

  if (nps_score !== undefined && nps_score !== null) {
    if (
      typeof nps_score !== "number" ||
      !Number.isInteger(nps_score) ||
      nps_score < 0 ||
      nps_score > 10
    ) {
      return NextResponse.json({ error: "nps_score must be between 0 and 10" }, { status: 400 });
    }
  }

  const areas: string[] = [];
  if (improvement_areas !== undefined && improvement_areas !== null) {
    if (!Array.isArray(improvement_areas)) {
      return NextResponse.json({ error: "improvement_areas must be an array" }, { status: 400 });
    }
    for (const a of improvement_areas) {
      if (typeof a !== "string" || !VALID_IMPROVEMENT_AREAS.has(a)) {
        return NextResponse.json({ error: `Invalid improvement area: ${a}` }, { status: 400 });
      }
      areas.push(a);
    }
  }

  const db = getSupabaseServer();

  // Verify event exists
  const { data: event } = await db
    .from("events")
    .select("id, title, start_date, start_time, end_date, end_time, registration_closes_at, registration_opens_at")
    .eq("id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Gate 1: Event must be completed
  const lifecycle = getLifecycle(event);
  if (!lifecycle.isCompleted) {
    return NextResponse.json({ error: "Feedback opens after the event ends" }, { status: 403 });
  }

  // Gate 2 & 3: Look up registration — verify it belongs to this event
  const { data: reg } = await db
    .from("event_registrations")
    .select("id, registration_code, user_email, user_name, payment_status, status")
    .eq("event_id", eventId)
    .eq("registration_code", (registration_code as string).trim().toUpperCase())
    .single();

  if (!reg) return NextResponse.json({ error: "Invalid registration code" }, { status: 400 });

  if (reg.payment_status !== "paid" && reg.payment_status !== "free") {
    return NextResponse.json(
      { error: "Feedback is only available for confirmed registrations" },
      { status: 403 }
    );
  }

  if (reg.status === "cancelled") {
    return NextResponse.json({ error: "This registration has been cancelled" }, { status: 403 });
  }

  // Gate 4: Duplicate check
  const { data: existing } = await db
    .from("event_feedback")
    .select("id, overall_rating, comment, created_at")
    .eq("event_id", eventId)
    .eq("submitter_email", reg.user_email.toLowerCase())
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        already: true,
        feedback: {
          overall_rating: existing.overall_rating,
          comment:        existing.comment,
          created_at:     existing.created_at,
        },
      },
      { status: 409 }
    );
  }

  // Insert
  const { error: insertErr } = await db.from("event_feedback").insert({
    event_id:            eventId,
    registration_id:     reg.id,
    registration_code:   reg.registration_code,
    submitter_email:     reg.user_email.toLowerCase(),
    submitter_name:      reg.user_name ?? null,
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
    if (insertErr.code === "23505") {
      return NextResponse.json({ already: true, feedback: null }, { status: 409 });
    }
    console.error("[events/feedback] insert error", insertErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Mark invitation feedback_submitted if exists
  await db
    .from("event_feedback_invitations")
    .update({ feedback_submitted: true })
    .eq("event_id", eventId)
    .eq("email", reg.user_email.toLowerCase());

  return NextResponse.json({ success: true });
}
