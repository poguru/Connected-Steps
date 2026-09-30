import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// ── GET /api/it-run/admin/feedback ────────────────────────────────────────────
// List all feedback for an IT Run event with filtering and pagination.
//
// Query params:
//   event_id     string  required (it_run_events.id)
//   page         int     default 0
//   per_page     int     default 50, max 200
//   flagged_only bool    default false
//   issue_status string  filter by issue_status
//   min_rating   int     filter: overall_rating >=
//   max_rating   int     filter: overall_rating <=
//   search       string  filter by submitter_name or comment (ilike)

export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const eventId     = sp.get("event_id") ?? "";
  const page        = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
  const perPage     = Math.min(200, Math.max(1, parseInt(sp.get("per_page") ?? "50", 10)));
  const flaggedOnly = sp.get("flagged_only") === "true";
  const issueStatus = sp.get("issue_status") ?? "";
  const minRating   = sp.get("min_rating") ? parseInt(sp.get("min_rating")!, 10) : null;
  const maxRating   = sp.get("max_rating") ? parseInt(sp.get("max_rating")!, 10) : null;
  const search      = sp.get("search")?.trim() ?? "";

  if (!eventId) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Verify event belongs to accessible scope (any portal session can view event they're assigned to)
  const { data: event } = await db
    .from("it_run_events")
    .select("id, title, event_date")
    .eq("id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let q = db
    .from("event_feedback")
    .select(
      "id, registration_code, submitter_email, submitter_name, " +
      "overall_rating, organisation_rating, route_rating, support_rating, " +
      "comment, would_recommend, nps_score, improvement_areas, " +
      "is_flagged, is_published, admin_notes, " +
      "issue_status, issue_priority, issue_assigned_to, issue_resolved_at, issue_resolution, " +
      "created_at, updated_at",
      { count: "exact" }
    )
    .eq("it_run_event_id", eventId)
    .order("created_at", { ascending: false })
    .range(page * perPage, page * perPage + perPage - 1);

  if (flaggedOnly) q = q.eq("is_flagged", true);
  if (issueStatus) q = q.eq("issue_status", issueStatus);
  if (minRating !== null) q = q.gte("overall_rating", minRating);
  if (maxRating !== null) q = q.lte("overall_rating", maxRating);
  if (search) q = q.or(`submitter_name.ilike.%${search}%,comment.ilike.%${search}%`);

  const { data, count, error } = await q;

  if (error) {
    console.error("[admin/feedback] list error", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    feedback: data ?? [],
    total:    count ?? 0,
    page,
    per_page: perPage,
  });
}

// ── PATCH /api/it-run/admin/feedback ─────────────────────────────────────────
// Update moderation fields on a feedback record.
//
// Body: {
//   id               string  required (event_feedback.id)
//   is_flagged       boolean optional
//   is_published     boolean optional
//   admin_notes      string  optional
//   issue_status     string  optional  ('none'|'open'|'in_progress'|'resolved'|'closed')
//   issue_priority   string  optional  ('low'|'medium'|'high'|'critical')
//   issue_assigned_to string optional
//   issue_resolution  string optional
// }

const VALID_ISSUE_STATUSES = new Set(["none", "open", "in_progress", "resolved", "closed"]);
const VALID_ISSUE_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, is_flagged, is_published, admin_notes, issue_status, issue_priority, issue_assigned_to, issue_resolution } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (issue_status !== undefined && !VALID_ISSUE_STATUSES.has(issue_status as string)) {
    return NextResponse.json({ error: "Invalid issue_status" }, { status: 400 });
  }

  if (issue_priority !== undefined && issue_priority !== null && !VALID_ISSUE_PRIORITIES.has(issue_priority as string)) {
    return NextResponse.json({ error: "Invalid issue_priority" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Confirm record exists and belongs to an accessible event
  const { data: existing } = await db
    .from("event_feedback")
    .select("id, it_run_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (is_flagged !== undefined)       patch.is_flagged       = Boolean(is_flagged);
  if (is_published !== undefined)     patch.is_published     = Boolean(is_published);
  if (admin_notes !== undefined)      patch.admin_notes      = admin_notes ?? null;
  if (issue_status !== undefined)     patch.issue_status     = issue_status;
  if (issue_priority !== undefined)   patch.issue_priority   = issue_priority ?? null;
  if (issue_assigned_to !== undefined) patch.issue_assigned_to = issue_assigned_to ?? null;
  if (issue_resolution !== undefined) patch.issue_resolution = issue_resolution ?? null;

  // Set resolved_at when transitioning to resolved/closed
  if (issue_status === "resolved" || issue_status === "closed") {
    patch.issue_resolved_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await db
    .from("event_feedback")
    .update(patch)
    .eq("id", id);

  if (error) {
    console.error("[admin/feedback] patch error", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Audit log (best effort — do not fail the request if audit insert fails)
  const existingTyped = existing as unknown as { id: string; it_run_event_id: string };
  void db.from("it_run_audit_logs").insert({
    event_id:    existingTyped.it_run_event_id,
    actor_email: session.email,
    actor_role:  session.role,
    action:      "feedback_moderated",
    entity_type: "event_feedback",
    entity_id:   id,
    detail:      patch,
  });

  return NextResponse.json({ success: true });
}
