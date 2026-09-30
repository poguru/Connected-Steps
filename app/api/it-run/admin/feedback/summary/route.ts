import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// ── GET /api/it-run/admin/feedback/summary ────────────────────────────────────
// Returns aggregate analytics for an IT Run event's feedback.
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

  // Verify event exists
  const { data: event } = await db
    .from("it_run_events")
    .select("id, title, event_date")
    .eq("id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  type FeedbackRow = {
    overall_rating: number;
    organisation_rating: number | null;
    route_rating: number | null;
    support_rating: number | null;
    would_recommend: boolean | null;
    nps_score: number | null;
    improvement_areas: string[];
    issue_status: string;
    is_flagged: boolean;
  };

  // Fetch all feedback for this event (no pagination — analytics need full set)
  const { data: rawRows, error } = await db
    .from("event_feedback")
    .select(
      "overall_rating, organisation_rating, route_rating, support_rating, " +
      "would_recommend, nps_score, improvement_areas, issue_status, is_flagged"
    )
    .eq("it_run_event_id", eventId);
  const rows = rawRows as FeedbackRow[] | null;

  if (error) {
    console.error("[admin/feedback/summary] error", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const total = (rows ?? []).length;

  if (total === 0) {
    return NextResponse.json({
      total_responses:     0,
      avg_overall:         null,
      avg_organisation:    null,
      avg_route:           null,
      avg_support:         null,
      nps_score:           null,
      would_recommend_pct: null,
      promoters_pct:       null,
      passives_pct:        null,
      detractors_pct:      null,
      open_issues:         0,
      resolved_issues:     0,
      flagged_count:       0,
      rating_distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      improvement_areas_frequency: {},
      event_title:         event.title,
      event_date:          event.event_date,
    });
  }

  const data = rows!;

  // ── Rating averages ───────────────────────────────────────────────────────
  const avg = (vals: (number | null)[]) => {
    const filtered = vals.filter((v): v is number => v !== null && v !== undefined);
    return filtered.length ? Math.round((filtered.reduce((a, b) => a + b, 0) / filtered.length) * 10) / 10 : null;
  };

  const avgOverall      = avg(data.map(r => r.overall_rating));
  const avgOrganisation = avg(data.map(r => r.organisation_rating));
  const avgRoute        = avg(data.map(r => r.route_rating));
  const avgSupport      = avg(data.map(r => r.support_rating));

  // ── Rating distribution (overall) ────────────────────────────────────────
  const dist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of data) {
    const k = String(r.overall_rating);
    if (k in dist) dist[k]++;
  }

  // ── NPS calculation ───────────────────────────────────────────────────────
  // NPS = % Promoters (9–10) − % Detractors (0–6)
  const npsRows = data.filter(r => r.nps_score !== null && r.nps_score !== undefined);
  let npsScore: number | null = null;
  let promotersPct: number | null = null;
  let passivesPct: number | null = null;
  let detractorsPct: number | null = null;

  if (npsRows.length > 0) {
    const promoters  = npsRows.filter(r => (r.nps_score as number) >= 9).length;
    const passives   = npsRows.filter(r => (r.nps_score as number) >= 7 && (r.nps_score as number) <= 8).length;
    const detractors = npsRows.filter(r => (r.nps_score as number) <= 6).length;
    const n = npsRows.length;
    promotersPct  = Math.round((promoters / n) * 100);
    passivesPct   = Math.round((passives / n) * 100);
    detractorsPct = Math.round((detractors / n) * 100);
    npsScore = promotersPct - detractorsPct;
  }

  // ── Would recommend ───────────────────────────────────────────────────────
  const recRows = data.filter(r => r.would_recommend !== null && r.would_recommend !== undefined);
  const wouldRecommendPct = recRows.length > 0
    ? Math.round((recRows.filter(r => r.would_recommend).length / recRows.length) * 100)
    : null;

  // ── Improvement areas frequency ───────────────────────────────────────────
  const areaFreq: Record<string, number> = {};
  for (const r of data) {
    for (const a of (r.improvement_areas ?? [])) {
      areaFreq[a] = (areaFreq[a] ?? 0) + 1;
    }
  }

  // ── Issue counts ──────────────────────────────────────────────────────────
  const openIssues     = data.filter(r => r.issue_status === "open" || r.issue_status === "in_progress").length;
  const resolvedIssues = data.filter(r => r.issue_status === "resolved" || r.issue_status === "closed").length;
  const flaggedCount   = data.filter(r => r.is_flagged).length;

  return NextResponse.json({
    total_responses:         total,
    avg_overall:             avgOverall,
    avg_organisation:        avgOrganisation,
    avg_route:               avgRoute,
    avg_support:             avgSupport,
    nps_score:               npsScore,
    would_recommend_pct:     wouldRecommendPct,
    promoters_pct:           promotersPct,
    passives_pct:            passivesPct,
    detractors_pct:          detractorsPct,
    open_issues:             openIssues,
    resolved_issues:         resolvedIssues,
    flagged_count:           flaggedCount,
    rating_distribution:     dist,
    improvement_areas_frequency: areaFreq,
    event_title:             event.title,
    event_date:              event.event_date,
  });
}
