"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";
const BLUE   = "#6366f1";
const PURPLE = "#a78bfa";

// ── Types ──────────────────────────────────────────────────────────────────────

type Summary = {
  total_responses: number;
  avg_overall: number | null;
  avg_organisation: number | null;
  avg_route: number | null;
  avg_support: number | null;
  nps_score: number | null;
  would_recommend_pct: number | null;
  promoters_pct: number | null;
  passives_pct: number | null;
  detractors_pct: number | null;
  open_issues: number;
  resolved_issues: number;
  flagged_count: number;
  rating_distribution: Record<string, number>;
  improvement_areas_frequency: Record<string, number>;
  event_title: string;
  event_date: string;
};

type Feedback = {
  id: string;
  registration_code: string | null;
  submitter_name: string | null;
  submitter_email: string;
  overall_rating: number;
  organisation_rating: number | null;
  route_rating: number | null;
  support_rating: number | null;
  comment: string;
  would_recommend: boolean | null;
  nps_score: number | null;
  improvement_areas: string[];
  is_flagged: boolean;
  is_published: boolean;
  admin_notes: string | null;
  issue_status: string;
  issue_priority: string | null;
  issue_assigned_to: string | null;
  issue_resolution: string | null;
  created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function Stars({ n, max = 5 }: { n: number | null; max?: number }) {
  if (n === null) return <span style={{ color: "#444" }}>—</span>;
  return (
    <span>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ color: i < n ? AMBER : "#333", fontSize: 13 }}>★</span>
      ))}
      <span style={{ fontSize: 12, color: "#aaa", marginLeft: 4 }}>{n}/{max}</span>
    </span>
  );
}

function IssueBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    none:        { color: "#444",  label: "None"       },
    open:        { color: RED,     label: "Open"       },
    in_progress: { color: AMBER,   label: "In Progress"},
    resolved:    { color: GREEN,   label: "Resolved"   },
    closed:      { color: "#555",  label: "Closed"     },
  };
  const m = map[status] ?? { color: "#444", label: status };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: `${m.color}20`, color: m.color, border: `1px solid ${m.color}40`,
    }}>{m.label}</span>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const map: Record<string, string> = {
    critical: RED, high: AMBER, medium: BLUE, low: "#555",
  };
  const color = map[priority] ?? "#555";
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700,
      background: `${color}20`, color, border: `1px solid ${color}40`,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>{priority}</span>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: "#888", width: 18, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: "rgba(255,255,255,0.05)", borderRadius: 7, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 7, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, color: "#aaa", width: 28, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "#fff" }: { label: string; value: string | number | null; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FeedbackAdminPage() {
  const [eventId,   setEventId]   = useState<string>("");
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [feedback,  setFeedback]  = useState<Feedback[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(0);
  const [tab,       setTab]       = useState<"dashboard" | "feedback" | "issues" | "analytics">("dashboard");
  const [search,    setSearch]    = useState("");
  const [filterFlag,setFilterFlag]= useState(false);
  const [filterIssue,setFilterIssue] = useState("");
  const [filterRatingMin, setFilterRatingMin] = useState("");
  const [filterRatingMax, setFilterRatingMax] = useState("");
  const [selected,  setSelected]  = useState<Feedback | null>(null);
  const [patching,  setPatching]  = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [issueStatus, setIssueStatus] = useState("");
  const [issuePriority, setIssuePriority] = useState("");
  const [issueAssignedTo, setIssueAssignedTo] = useState("");
  const [issueResolution, setIssueResolution] = useState("");
  const [loading,   setLoading]   = useState(false);

  // Load event ID from sprint-2 event config
  useEffect(() => {
    fetch("/api/it-run/event-config")
      .then(r => r.json())
      .then(d => { if (d.id) setEventId(d.id); })
      .catch(() => {});
  }, []);

  const loadSummary = useCallback(async () => {
    if (!eventId) return;
    const r = await fetch(`/api/it-run/admin/feedback/summary?event_id=${eventId}`);
    if (r.ok) setSummary(await r.json());
  }, [eventId]);

  const loadFeedback = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const sp = new URLSearchParams({
      event_id: eventId,
      page:     String(page),
      per_page: "50",
    });
    if (filterFlag)         sp.set("flagged_only", "true");
    if (filterIssue)        sp.set("issue_status", filterIssue);
    if (filterRatingMin)    sp.set("min_rating", filterRatingMin);
    if (filterRatingMax)    sp.set("max_rating", filterRatingMax);
    if (search)             sp.set("search", search);

    const r = await fetch(`/api/it-run/admin/feedback?${sp}`);
    if (r.ok) {
      const d = await r.json() as { feedback: Feedback[]; total: number };
      setFeedback(d.feedback ?? []);
      setTotal(d.total ?? 0);
    }
    setLoading(false);
  }, [eventId, page, filterFlag, filterIssue, filterRatingMin, filterRatingMax, search]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  function openDetail(f: Feedback) {
    setSelected(f);
    setAdminNote(f.admin_notes ?? "");
    setIssueStatus(f.issue_status);
    setIssuePriority(f.issue_priority ?? "");
    setIssueAssignedTo(f.issue_assigned_to ?? "");
    setIssueResolution(f.issue_resolution ?? "");
  }

  async function savePatch() {
    if (!selected) return;
    setPatching(true);
    const body: Record<string, unknown> = { id: selected.id };
    if (adminNote !== (selected.admin_notes ?? ""))    body.admin_notes       = adminNote || null;
    if (issueStatus !== selected.issue_status)         body.issue_status      = issueStatus;
    if (issuePriority !== (selected.issue_priority ?? "")) body.issue_priority = issuePriority || null;
    if (issueAssignedTo !== (selected.issue_assigned_to ?? "")) body.issue_assigned_to = issueAssignedTo || null;
    if (issueResolution !== (selected.issue_resolution ?? "")) body.issue_resolution = issueResolution || null;

    const r = await fetch("/api/it-run/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setSelected(null);
      loadFeedback();
      loadSummary();
    }
    setPatching(false);
  }

  async function toggleFlag(f: Feedback, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch("/api/it-run/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, is_flagged: !f.is_flagged }),
    });
    loadFeedback();
  }

  async function togglePublish(f: Feedback, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch("/api/it-run/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, is_published: !f.is_published }),
    });
    loadFeedback();
  }

  const totalPages = Math.ceil(total / 50);

  // ── Dashboard tab ─────────────────────────────────────────────────────────

  const renderDashboard = () => {
    if (!summary) return <div style={{ color: "#666" }}>Loading…</div>;

    const maxDist = Math.max(...Object.values(summary.rating_distribution));
    const distColors = { "5": GREEN, "4": "#4ade80", "3": AMBER, "2": "#fb923c", "1": RED };

    const topAreas = Object.entries(summary.improvement_areas_frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
    const maxArea = topAreas[0]?.[1] ?? 1;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Key metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
          <StatCard label="Responses"        value={summary.total_responses} />
          <StatCard label="Avg Rating"       value={summary.avg_overall !== null ? `${summary.avg_overall}/5` : null} color={AMBER} />
          <StatCard label="NPS Score"        value={summary.nps_score !== null ? (summary.nps_score > 0 ? `+${summary.nps_score}` : String(summary.nps_score)) : null} color={summary.nps_score !== null && summary.nps_score > 0 ? GREEN : RED} />
          <StatCard label="Would Recommend"  value={summary.would_recommend_pct !== null ? `${summary.would_recommend_pct}%` : null} color={GREEN} />
          <StatCard label="Open Issues"      value={summary.open_issues} color={summary.open_issues > 0 ? RED : "#555"} />
          <StatCard label="Flagged"          value={summary.flagged_count} color={summary.flagged_count > 0 ? AMBER : "#555"} />
        </div>

        {/* NPS breakdown */}
        {summary.promoters_pct !== null && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 12 }}>NPS Breakdown</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { label: "Promoters (9–10)", pct: summary.promoters_pct,  color: GREEN },
                { label: "Passives (7–8)",   pct: summary.passives_pct!,  color: AMBER },
                { label: "Detractors (0–6)", pct: summary.detractors_pct!, color: RED  },
              ].map(g => (
                <div key={g.label} style={{ flex: 1, minWidth: 120, textAlign: "center", padding: "12px 8px", background: `${g.color}10`, borderRadius: 10, border: `1px solid ${g.color}25` }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: g.color }}>{g.pct}%</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{g.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rating distribution + category averages */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 12 }}>Rating Distribution</div>
            {["5","4","3","2","1"].map(k => (
              <MiniBar key={k} label={k} value={summary.rating_distribution[k] ?? 0} max={maxDist || 1} color={(distColors as Record<string, string>)[k]} />
            ))}
          </div>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 12 }}>Category Averages</div>
            {[
              { label: "Organisation", val: summary.avg_organisation },
              { label: "Route",        val: summary.avg_route        },
              { label: "Support",      val: summary.avg_support      },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#888" }}>{r.label}</span>
                {r.val !== null ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 80, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(r.val / 5) * 100}%`, background: AMBER, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, color: AMBER, fontWeight: 700 }}>{r.val}</span>
                  </div>
                ) : <span style={{ color: "#444", fontSize: 12 }}>—</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Top improvement areas */}
        {topAreas.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 12 }}>Top Improvement Areas</div>
            {topAreas.map(([area, count]) => (
              <MiniBar key={area} label={area.replace(/_/g, " ")} value={count} max={maxArea} color={PURPLE} />
            ))}
          </div>
        )}

        {/* Export button */}
        <div>
          <a href={`/api/it-run/admin/feedback/export?event_id=${eventId}`}
            style={{ display: "inline-block", padding: "10px 20px", background: `${ACCENT}15`, border: `1px solid ${ACCENT}40`, borderRadius: 10, color: ACCENT, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            Download CSV Export
          </a>
        </div>
      </div>
    );
  };

  // ── Feedback list tab ─────────────────────────────────────────────────────

  const renderFeedbackList = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search name or comment…"
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit" }}
        />
        <select value={filterRatingMin} onChange={e => { setFilterRatingMin(e.target.value); setPage(0); }}
          style={{ padding: "8px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, fontFamily: "inherit" }}>
          <option value="">Min ★</option>
          {[1,2,3,4,5].map(n => <option key={n} value={String(n)}>{n}★</option>)}
        </select>
        <select value={filterRatingMax} onChange={e => { setFilterRatingMax(e.target.value); setPage(0); }}
          style={{ padding: "8px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, fontFamily: "inherit" }}>
          <option value="">Max ★</option>
          {[1,2,3,4,5].map(n => <option key={n} value={String(n)}>{n}★</option>)}
        </select>
        <button onClick={() => { setFilterFlag(!filterFlag); setPage(0); }}
          style={{ padding: "8px 12px", background: filterFlag ? `${AMBER}20` : "rgba(255,255,255,0.05)", border: `1px solid ${filterFlag ? AMBER : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: filterFlag ? AMBER : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          🚩 Flagged
        </button>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: "#555" }}>{total} response{total !== 1 ? "s" : ""}</div>

      {loading && <div style={{ color: "#555", fontSize: 13 }}>Loading…</div>}

      {/* Rows */}
      {feedback.map(f => (
        <div key={f.id} onClick={() => openDetail(f)}
          style={{
            background: "rgba(255,255,255,0.02)", border: `1px solid ${f.is_flagged ? AMBER + "50" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 12, padding: 16, cursor: "pointer", transition: "border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = ACCENT + "50"}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = f.is_flagged ? AMBER + "50" : "rgba(255,255,255,0.07)"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{f.submitter_name || f.submitter_email}</span>
              {f.registration_code && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "#555" }}>{f.registration_code}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Stars n={f.overall_rating} />
              <IssueBadge status={f.issue_status} />
              {f.issue_priority && <PriorityBadge priority={f.issue_priority} />}
              {!f.is_published && (
                <span style={{ fontSize: 10, padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 10, color: "#555" }}>Hidden</span>
              )}
            </div>
          </div>
          {f.comment && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#aaa", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>
              {f.comment}
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#444" }}>{new Date(f.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            <button onClick={e => toggleFlag(f, e)}
              style={{ padding: "3px 8px", background: f.is_flagged ? `${AMBER}20` : "transparent", border: `1px solid ${f.is_flagged ? AMBER + "50" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, color: f.is_flagged ? AMBER : "#555", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              {f.is_flagged ? "🚩 Flagged" : "Flag"}
            </button>
            <button onClick={e => togglePublish(f, e)}
              style={{ padding: "3px 8px", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: f.is_published ? GREEN : "#555", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              {f.is_published ? "✓ Published" : "Hidden"}
            </button>
          </div>
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: page === 0 ? "#444" : "#fff", cursor: page === 0 ? "default" : "pointer", fontFamily: "inherit", fontSize: 13 }}>
            ← Prev
          </button>
          <span style={{ padding: "6px 0", fontSize: 12, color: "#666" }}>Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: page >= totalPages - 1 ? "#444" : "#fff", cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "inherit", fontSize: 13 }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );

  // ── Issues tab ────────────────────────────────────────────────────────────

  const renderIssues = () => {
    const STATUSES = ["open", "in_progress", "resolved", "closed"];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => { setFilterIssue(""); setTab("issues"); loadFeedback(); }}
            style={{ padding: "6px 14px", background: !filterIssue ? `${ACCENT}20` : "rgba(255,255,255,0.05)", border: `1px solid ${!filterIssue ? ACCENT + "50" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: !filterIssue ? ACCENT : "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            All
          </button>
          {STATUSES.map(s => (
            <button key={s} onClick={() => { setFilterIssue(s); setPage(0); }}
              style={{ padding: "6px 14px", background: filterIssue === s ? `${ACCENT}20` : "rgba(255,255,255,0.05)", border: `1px solid ${filterIssue === s ? ACCENT + "50" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: filterIssue === s ? ACCENT : "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {/* Issues with non-none status */}
        {feedback.filter(f => f.issue_status !== "none").map(f => (
          <div key={f.id} onClick={() => openDetail(f)}
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{f.submitter_name || f.submitter_email}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <IssueBadge status={f.issue_status} />
                <PriorityBadge priority={f.issue_priority} />
              </div>
            </div>
            {f.comment && (
              <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.4, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>
                {f.comment}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {f.issue_assigned_to && <span style={{ fontSize: 11, color: "#555" }}>Assigned to: {f.issue_assigned_to}</span>}
              <span style={{ fontSize: 11, color: "#444" }}>{new Date(f.created_at).toLocaleString("en-IN", { dateStyle: "short" })}</span>
            </div>
          </div>
        ))}

        {feedback.filter(f => f.issue_status !== "none").length === 0 && (
          <div style={{ color: "#555", fontSize: 13, padding: 20, textAlign: "center" }}>No issues found for this filter.</div>
        )}
      </div>
    );
  };

  // ── Analytics tab ─────────────────────────────────────────────────────────

  const renderAnalytics = () => {
    if (!summary) return <div style={{ color: "#666" }}>Loading…</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 16 }}>Category Ratings</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {[
              { label: "Overall",      val: summary.avg_overall,      color: AMBER  },
              { label: "Organisation", val: summary.avg_organisation,  color: ACCENT },
              { label: "Route",        val: summary.avg_route,         color: GREEN  },
              { label: "Support",      val: summary.avg_support,       color: BLUE   },
            ].map(r => (
              <div key={r.label} style={{ textAlign: "center", padding: "20px 12px", background: `${r.color}08`, borderRadius: 10, border: `1px solid ${r.color}20` }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: r.color }}>{r.val ?? "—"}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{r.label} / 5</div>
                {r.val !== null && (
                  <div style={{ margin: "10px auto 0", width: 80, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.val / 5) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 16 }}>NPS</div>
          {summary.nps_score !== null ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: summary.nps_score >= 50 ? GREEN : summary.nps_score >= 0 ? AMBER : RED }}>
                {summary.nps_score > 0 ? "+" : ""}{summary.nps_score}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>Net Promoter Score</div>
              <div style={{ display: "flex", height: 20, borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
                <div style={{ flex: summary.detractors_pct!, background: RED, transition: "flex 0.4s" }} title={`Detractors: ${summary.detractors_pct}%`} />
                <div style={{ flex: summary.passives_pct!, background: AMBER, transition: "flex 0.4s" }} title={`Passives: ${summary.passives_pct}%`} />
                <div style={{ flex: summary.promoters_pct!, background: GREEN, transition: "flex 0.4s" }} title={`Promoters: ${summary.promoters_pct}%`} />
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#888" }}>
                <span><span style={{ color: RED }}>■</span> Detractors {summary.detractors_pct}%</span>
                <span><span style={{ color: AMBER }}>■</span> Passives {summary.passives_pct}%</span>
                <span><span style={{ color: GREEN }}>■</span> Promoters {summary.promoters_pct}%</span>
              </div>
            </div>
          ) : (
            <div style={{ color: "#555", fontSize: 13 }}>No NPS data collected yet.</div>
          )}
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 16 }}>Issue Resolution</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
            <StatCard label="Open Issues"     value={summary.open_issues}    color={RED}   />
            <StatCard label="Resolved"        value={summary.resolved_issues} color={GREEN} />
            <StatCard label="Flagged"         value={summary.flagged_count}  color={AMBER} />
          </div>
        </div>
      </div>
    );
  };

  // ── Detail panel ──────────────────────────────────────────────────────────

  const renderDetail = () => {
    if (!selected) return null;
    const f = selected;
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200,
        display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
        padding: 0,
      }} onClick={() => setSelected(null)}>
        <div onClick={e => e.stopPropagation()}
          style={{
            width: "min(500px,100vw)", height: "100%", background: "#0d0d0d",
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            overflowY: "auto", padding: 24,
            display: "flex", flexDirection: "column", gap: 16,
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Feedback Detail</div>
            <button onClick={() => setSelected(null)}
              style={{ padding: "4px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{f.submitter_name || f.submitter_email}</div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{f.submitter_email}</div>
            {f.registration_code && <div style={{ fontSize: 11, color: "#555" }}>{f.registration_code}</div>}
            <div style={{ marginTop: 10 }}><Stars n={f.overall_rating} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Organisation", val: f.organisation_rating },
              { label: "Route",        val: f.route_rating        },
              { label: "Support",      val: f.support_rating      },
            ].map(r => (
              <div key={r.label} style={{ textAlign: "center", padding: "10px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: AMBER }}>{r.val ?? "—"}</div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{r.label}</div>
              </div>
            ))}
          </div>

          {f.nps_score !== null && (
            <div style={{ fontSize: 13, color: "#aaa" }}>NPS Score: <strong style={{ color: "#fff" }}>{f.nps_score}/10</strong></div>
          )}
          {f.would_recommend !== null && (
            <div style={{ fontSize: 13, color: "#aaa" }}>Would Recommend: <strong style={{ color: f.would_recommend ? GREEN : RED }}>{f.would_recommend ? "Yes" : "No"}</strong></div>
          )}

          {f.comment && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Comment</div>
              <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>{f.comment}</div>
            </div>
          )}

          {f.improvement_areas.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Improvement Areas</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {f.improvement_areas.map(a => (
                  <span key={a} style={{ padding: "3px 10px", background: `${PURPLE}15`, border: `1px solid ${PURPLE}30`, borderRadius: 20, fontSize: 11, color: PURPLE }}>
                    {a.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.07)" }} />

          {/* Admin fields */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>Admin / Issue Management</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>Issue Status</label>
                <select value={issueStatus} onChange={e => setIssueStatus(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit" }}>
                  {["none","open","in_progress","resolved","closed"].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>Priority</label>
                <select value={issuePriority} onChange={e => setIssuePriority(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit" }}>
                  <option value="">No priority</option>
                  {["low","medium","high","critical"].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>Assigned To</label>
                <input value={issueAssignedTo} onChange={e => setIssueAssignedTo(e.target.value)}
                  placeholder="staff@connectedsteps.in"
                  style={{ width: "100%", padding: "8px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>Resolution Notes</label>
                <textarea value={issueResolution} onChange={e => setIssueResolution(e.target.value)}
                  rows={3} placeholder="How was this resolved?"
                  style={{ width: "100%", padding: "8px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>Admin Notes (internal)</label>
                <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
                  rows={2} placeholder="Internal notes…"
                  style={{ width: "100%", padding: "8px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>

          <button onClick={savePatch} disabled={patching}
            style={{ padding: "10px 0", background: patching ? "rgba(255,255,255,0.05)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: patching ? "default" : "pointer", fontFamily: "inherit", width: "100%" }}>
            {patching ? "Saving…" : "Save Changes"}
          </button>

          <div style={{ fontSize: 11, color: "#444" }}>Submitted {new Date(f.created_at).toLocaleString("en-IN")}</div>
        </div>
      </div>
    );
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const TABS: { key: typeof tab; label: string; badge?: number }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "feedback",  label: "Feedback",  badge: total > 0 ? total : undefined },
    { key: "issues",    label: "Issues",    badge: summary?.open_issues || undefined },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>
          Participant Feedback
        </h1>
        {summary && (
          <div style={{ fontSize: 13, color: "#666" }}>
            {summary.event_title} · {new Date(summary.event_date).toLocaleDateString("en-IN", { dateStyle: "long" })}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 24, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", background: "transparent", border: "none",
              borderBottom: tab === t.key ? `2px solid ${ACCENT}` : "2px solid transparent",
              color: tab === t.key ? "#fff" : "#666", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            {t.label}
            {t.badge !== undefined && (
              <span style={{ padding: "1px 6px", background: ACCENT, borderRadius: 10, fontSize: 10, color: "#fff", fontWeight: 700 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {!eventId ? (
        <div style={{ color: "#555", fontSize: 13 }}>Loading event…</div>
      ) : (
        <>
          {tab === "dashboard" && renderDashboard()}
          {tab === "feedback"  && renderFeedbackList()}
          {tab === "issues"    && renderIssues()}
          {tab === "analytics" && renderAnalytics()}
        </>
      )}

      {selected && renderDetail()}
    </div>
  );
}
