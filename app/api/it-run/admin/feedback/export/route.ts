import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// ── GET /api/it-run/admin/feedback/export ─────────────────────────────────────
// Download all feedback for an IT Run event as CSV.
//
// Query params:
//   event_id  string  required (it_run_events.id)

export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = req.nextUrl.searchParams.get("event_id") ?? "";
  if (!eventId) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events")
    .select("id, title")
    .eq("id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  type ExportRow = {
    registration_code: string | null;
    submitter_name: string | null;
    submitter_email: string;
    overall_rating: number;
    organisation_rating: number | null;
    route_rating: number | null;
    support_rating: number | null;
    would_recommend: boolean | null;
    nps_score: number | null;
    comment: string;
    improvement_areas: string[];
    is_flagged: boolean;
    is_published: boolean;
    issue_status: string;
    issue_priority: string | null;
    issue_assigned_to: string | null;
    created_at: string;
  };

  const { data: rawData, error } = await db
    .from("event_feedback")
    .select(
      "registration_code, submitter_name, submitter_email, " +
      "overall_rating, organisation_rating, route_rating, support_rating, " +
      "would_recommend, nps_score, comment, improvement_areas, " +
      "is_flagged, is_published, issue_status, issue_priority, " +
      "issue_assigned_to, created_at"
    )
    .eq("it_run_event_id", eventId)
    .order("created_at", { ascending: true });
  const data = rawData as ExportRow[] | null;

  if (error) {
    console.error("[admin/feedback/export] error", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const rows = data ?? [];

  // ── Build CSV ─────────────────────────────────────────────────────────────
  const headers = [
    "Reg Code", "Name", "Email",
    "Overall", "Organisation", "Route", "Support",
    "Would Recommend", "NPS Score", "Comment",
    "Improvement Areas", "Flagged", "Published",
    "Issue Status", "Issue Priority", "Issue Assigned To", "Submitted At",
  ];

  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      escape(r.registration_code),
      escape(r.submitter_name),
      escape(r.submitter_email),
      escape(r.overall_rating),
      escape(r.organisation_rating),
      escape(r.route_rating),
      escape(r.support_rating),
      escape(r.would_recommend === null ? "" : r.would_recommend ? "Yes" : "No"),
      escape(r.nps_score),
      escape(r.comment),
      escape((r.improvement_areas ?? []).join("; ")),
      escape(r.is_flagged ? "Yes" : "No"),
      escape(r.is_published ? "Yes" : "No"),
      escape(r.issue_status),
      escape(r.issue_priority),
      escape(r.issue_assigned_to),
      escape(r.created_at),
    ].join(","));
  }

  const csv = lines.join("\r\n");
  const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filename = `feedback-${slug}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
