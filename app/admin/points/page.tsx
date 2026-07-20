"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardBody, Button, Input, Textarea, Select, Alert, Skeleton, Badge, Pagination } from "@/components/ui/ds";

// ── IST helpers ───────────────────────────────────────────────────────────────
const IST_MS = 5.5 * 60 * 60 * 1000;
function currentMonth(): string {
  return new Date(Date.now() + IST_MS).toISOString().slice(0, 7);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CategoryStat  { category: string; points: number; count: number; }
interface TopEarner     { rank: number; user_email: string; user_name: string; month_points: number; total_points: number; }
interface SummaryData   { month: string; grand_total: number; active_users: number; by_category: CategoryStat[]; top_earners: TopEarner[]; }

interface Transaction {
  id:             number;
  user_email:     string;
  user_name:      string;
  session_title:  string | null;
  session_date:   string | null;
  points:         number;
  category:       string;
  category_label: string;
  reason:         string;
  awarded_by:     string | null;
  created_at:     string;
}

interface HistoryData {
  transactions: Transaction[];
  page:         number;
  total_pages:  number;
  total_count:  number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  attendance:       "#4ade80",
  weekly_bonus:     "#fbbf24",
  bonus:            "#f87171",
  challenge:        "#60a5fa",
  referral:         "#34d399",
  strava:           "#f97316",
  admin_adjustment: "#a78bfa",
  streak:           "#fb923c",
};

const CATEGORY_ICONS: Record<string, string> = {
  attendance:       "🏃",
  weekly_bonus:     "🏆",
  bonus:            "⭐",
  challenge:        "🎯",
  referral:         "🔗",
  strava:           "🚴",
  admin_adjustment: "⚙️",
  streak:           "🔥",
};

const ADJUST_CATEGORIES = [
  { value: "award",  label: "Award Points  (+)" },
  { value: "deduct", label: "Deduct Points (−)" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Types for weekly bonus audit ──────────────────────────────────────────────
interface WBAUser {
  email:            string;
  name:             string;
  sessions_in_week: number;
  attendance_dates: string[];
  session_titles:   string[];
  attendance_pts:   number;
  bonus_eligible:   boolean;
  bonus_awarded:    boolean | null;
  reason:           string | null;
}
interface WBAWeek {
  week_start:               string;
  week_end:                 string;
  week_label:               string;
  total_users_attending:    number;
  users_eligible_for_bonus: number;
  users_awarded_bonus:      number;
  users:                    WBAUser[];
}
interface WBADiscrepancy {
  email:          string;
  name:           string;
  week_start:     string;
  week_label:     string;
  sessions_count: number;
  root_cause:     string;
  fix:            string;
}
interface WBAData {
  month:                      string;
  generated_at:               string;
  week_key_column_exists:     boolean;
  note:                       string | null;
  weeks:                      WBAWeek[];
  summary: {
    total_sessions_in_month:       number;
    total_users_with_attendance:   number;
    total_users_eligible:          number;
    total_bonuses_expected:        number;
    total_bonuses_awarded:         number;
    discrepancies:                 number;
  };
  discrepancies: WBADiscrepancy[];
}

// ── Types for recalculate ─────────────────────────────────────────────────────
interface PerUserAudit {
  email:                string;
  name:                 string;
  attendance_count:     number;
  expected_month_pts:   number;
  current_lb_month_pts: number;
  lb_drift:             number;
  missing_att_ledger:   number;
  missing_bonus_ledger: number;
  bonus_weeks:          string[];
}
interface AuditData {
  month:                       string;
  sessions_count:              number;
  users_affected:              number;
  attendance_records:          number;
  missing_attendance_ledger:   number;
  missing_weekly_bonus_ledger: number;
  duplicate_attendance_rows:   number;
  leaderboard_drift_count:     number;
  week_key_column_exists:      boolean;
  per_user:                    PerUserAudit[];
}
interface RecalcResult {
  month:   string;
  audit:   AuditData;
  actions: {
    attendance_ledger_rows_added:   number;
    weekly_bonus_ledger_rows_added: number;
    leaderboard_users_updated:      number;
    leaderboard_message:            string;
  };
  summary: {
    users_recalculated:     number;
    attendance_points_added: number;
    weekly_bonuses_added:   number;
    duplicates_removed:     number;
    leaderboard_updated:    number;
    inconsistencies:        number;
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPointsPage() {
  // ── Weekly bonus audit ──
  const [wbaData,        setWbaData]        = useState<WBAData | null>(null);
  const [wbaLoading,     setWbaLoading]     = useState(false);
  const [wbaMsg,         setWbaMsg]         = useState<string | null>(null);
  const [expandedWeeks,  setExpandedWeeks]  = useState<Set<string>>(new Set());
  const [wbaShowAll,     setWbaShowAll]     = useState(false);

  // ── Recalculate ──
  const [auditData,      setAuditData]      = useState<AuditData | null>(null);
  const [recalcResult,   setRecalcResult]   = useState<RecalcResult | null>(null);
  const [auditLoading,   setAuditLoading]   = useState(false);
  const [recalcLoading,  setRecalcLoading]  = useState(false);
  const [recalcMsg,      setRecalcMsg]      = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPerUser,    setShowPerUser]    = useState(false);

  // ── Summary ──
  const [summary,       setSummary]       = useState<SummaryData | null>(null);
  const [summaryLoad,   setSummaryLoad]   = useState(true);

  // ── History ──
  const [history,       setHistory]       = useState<HistoryData | null>(null);
  const [historyLoad,   setHistoryLoad]   = useState(true);
  const [histPage,      setHistPage]      = useState(1);
  const [filterEmail,   setFilterEmail]   = useState("");
  const [filterCat,     setFilterCat]     = useState("");
  const [filterFrom,    setFilterFrom]    = useState("");
  const [filterTo,      setFilterTo]      = useState("");

  // ── Adjust form ──
  const [adjEmail,   setAdjEmail]   = useState("");
  const [adjMode,    setAdjMode]    = useState<"award" | "deduct">("award");
  const [adjPoints,  setAdjPoints]  = useState("");
  const [adjReason,  setAdjReason]  = useState("");
  const [adjNotes,   setAdjNotes]   = useState("");
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjMsg,     setAdjMsg]     = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Weekly bonus audit fetch ──
  async function runWBA() {
    setWbaLoading(true);
    setWbaMsg(null);
    try {
      const res  = await fetch(`/api/admin/points/weekly-bonus-audit?month=${currentMonth()}`);
      const json = await res.json() as WBAData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Audit failed");
      setWbaData(json);
      // Auto-expand weeks that have discrepancies
      const toExpand = new Set<string>();
      for (const w of json.weeks) {
        if (w.users.some(u => u.bonus_eligible && u.bonus_awarded === false)) {
          toExpand.add(w.week_start);
        }
      }
      setExpandedWeeks(toExpand);
    } catch (e) {
      setWbaMsg(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setWbaLoading(false);
    }
  }

  function toggleWeek(wk: string) {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(wk)) next.delete(wk); else next.add(wk);
      return next;
    });
  }

  // ── Audit ──
  async function runAudit() {
    setAuditLoading(true);
    setRecalcMsg(null);
    setRecalcResult(null);
    try {
      const res  = await fetch(`/api/admin/points/recalculate?month=${currentMonth()}`);
      const json = await res.json() as { audit?: AuditData; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Audit failed");
      setAuditData(json.audit ?? null);
    } catch (e) {
      setRecalcMsg({ type: "error", text: e instanceof Error ? e.message : "Audit failed" });
    } finally {
      setAuditLoading(false);
    }
  }

  async function runRecalculate() {
    setRecalcLoading(true);
    setRecalcMsg(null);
    try {
      const res  = await fetch("/api/admin/points/recalculate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ month: currentMonth() }),
      });
      const json = await res.json() as RecalcResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Recalculation failed");
      setRecalcResult(json);
      setAuditData(json.audit);
      setRecalcMsg({
        type: "success",
        text: `Recalculation complete — ${json.summary.users_recalculated} users, ${json.summary.attendance_points_added} attendance pts added, ${json.summary.weekly_bonuses_added} weekly bonuses added, ${json.summary.leaderboard_updated} leaderboard rows updated.`,
      });
      // Refresh summary stats
      setSummaryLoad(true);
      fetch(`/api/admin/points/summary?month=${currentMonth()}`)
        .then(r => r.json() as Promise<SummaryData>)
        .then(d => setSummary(d))
        .catch(() => {})
        .finally(() => setSummaryLoad(false));
    } catch (e) {
      setRecalcMsg({ type: "error", text: e instanceof Error ? e.message : "Recalculation failed" });
    } finally {
      setRecalcLoading(false);
    }
  }

  // ── Load summary ──
  useEffect(() => {
    setSummaryLoad(true);
    fetch(`/api/admin/points/summary?month=${currentMonth()}`)
      .then(r => r.json() as Promise<SummaryData>)
      .then(d => setSummary(d))
      .catch(() => {})
      .finally(() => setSummaryLoad(false));
  }, []);

  // ── Load history ──
  const loadHistory = useCallback((pg: number) => {
    setHistoryLoad(true);
    const params = new URLSearchParams({ page: String(pg), limit: "25" });
    if (filterEmail.trim()) params.set("user_email", filterEmail.trim());
    if (filterCat)          params.set("category",   filterCat);
    if (filterFrom)         params.set("from",        filterFrom);
    if (filterTo)           params.set("to",          filterTo);

    fetch(`/api/admin/points/history?${params}`)
      .then(r => r.json() as Promise<HistoryData>)
      .then(d => setHistory(d))
      .catch(() => {})
      .finally(() => setHistoryLoad(false));
  }, [filterEmail, filterCat, filterFrom, filterTo]);

  useEffect(() => { loadHistory(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters() { setHistPage(1); loadHistory(1); }

  function clearFilters() {
    setFilterEmail(""); setFilterCat(""); setFilterFrom(""); setFilterTo("");
    setHistPage(1);
    setHistoryLoad(true);
    fetch("/api/admin/points/history?page=1&limit=25")
      .then(r => r.json() as Promise<HistoryData>)
      .then(d => setHistory(d))
      .catch(() => {})
      .finally(() => setHistoryLoad(false));
  }

  // ── Submit adjustment ──
  async function submitAdjustment() {
    const pts = parseInt(adjPoints, 10);
    if (!adjEmail.trim() || !pts || !adjReason.trim()) {
      setAdjMsg({ type: "error", text: "User email, points, and reason are all required." });
      return;
    }
    setAdjLoading(true);
    setAdjMsg(null);
    try {
      const signedPoints = adjMode === "deduct" ? -Math.abs(pts) : Math.abs(pts);
      const res = await fetch("/api/admin/points/adjust", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          user_email: adjEmail.trim().toLowerCase(),
          points:     signedPoints,
          reason:     adjReason.trim(),
          notes:      adjNotes.trim() || undefined,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setAdjMsg({ type: "error", text: json.error ?? "Adjustment failed." });
      } else {
        setAdjMsg({ type: "success", text: `${adjMode === "award" ? "Awarded" : "Deducted"} ${Math.abs(pts)} points to ${adjEmail.trim()}.` });
        setAdjEmail(""); setAdjPoints(""); setAdjReason(""); setAdjNotes("");
        loadHistory(1);
      }
    } catch {
      setAdjMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setAdjLoading(false);
    }
  }

  return (
    <div style={{ padding: "28px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#fff" }}>Points Management</h1>
        <p style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
          Award, deduct, and audit all points transactions across the community.
        </p>
      </div>

      {/* ── Audit & Recalculate ── */}
      <Card style={{ marginBottom: 28, border: "1px solid rgba(232,98,10,0.2)" }}>
        <CardBody style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
                Points Audit &amp; Recalculation
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                Recalculates all points for <strong style={{ color: "#e8620a" }}>{currentMonth()}</strong> from attendance records.
                Safe to run multiple times — idempotent.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="ghost"
                onClick={runAudit}
                loading={auditLoading}
                disabled={auditLoading || recalcLoading}
              >
                Run Audit Only
              </Button>
              <Button
                variant="primary"
                onClick={runRecalculate}
                loading={recalcLoading}
                disabled={auditLoading || recalcLoading}
              >
                Audit &amp; Recalculate
              </Button>
            </div>
          </div>

          {recalcMsg && (
            <Alert variant={recalcMsg.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>
              {recalcMsg.text}
            </Alert>
          )}

          {/* Audit results */}
          {auditData && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                {[
                  { label: "Sessions",          value: auditData.sessions_count,              color: "#60a5fa" },
                  { label: "Users w/ Attendance", value: auditData.users_affected,            color: "#4ade80" },
                  { label: "Attendance Records", value: auditData.attendance_records,          color: "#4ade80" },
                  { label: "Missing Att. Ledger", value: auditData.missing_attendance_ledger, color: auditData.missing_attendance_ledger > 0 ? "#f87171" : "#4ade80" },
                  { label: "Missing Bonus Ledger", value: auditData.missing_weekly_bonus_ledger, color: auditData.missing_weekly_bonus_ledger > 0 ? "#fbbf24" : "#4ade80" },
                  { label: "LB Drift (users)",  value: auditData.leaderboard_drift_count,    color: auditData.leaderboard_drift_count > 0 ? "#f87171" : "#4ade80" },
                  { label: "Duplicate Rows",    value: auditData.duplicate_attendance_rows,   color: auditData.duplicate_attendance_rows > 0 ? "#f87171" : "#4ade80" },
                ].map(s => (
                  <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-user drift table — only users with issues */}
              {auditData.per_user.filter(u => u.lb_drift !== 0 || u.missing_att_ledger > 0 || u.missing_bonus_ledger > 0).length > 0 && (
                <div>
                  <button
                    onClick={() => setShowPerUser(p => !p)}
                    style={{ fontSize: 12, color: "#e8620a", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
                  >
                    {showPerUser ? "▲ Hide" : "▼ Show"} per-user details ({auditData.per_user.filter(u => u.lb_drift !== 0 || u.missing_att_ledger > 0 || u.missing_bonus_ledger > 0).length} users with issues)
                  </button>

                  {showPerUser && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr style={{ color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {["Member","Sessions","Expected Pts","LB Pts","Drift","Missing Att","Missing Bonus"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {auditData.per_user
                            .filter(u => u.lb_drift !== 0 || u.missing_att_ledger > 0 || u.missing_bonus_ledger > 0)
                            .sort((a, b) => Math.abs(b.lb_drift) - Math.abs(a.lb_drift))
                            .map(u => (
                              <tr key={u.email} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "7px 8px" }}>
                                  <div style={{ fontWeight: 600, color: "#fff" }}>{u.name}</div>
                                  <div style={{ color: "#555" }}>{u.email}</div>
                                </td>
                                <td style={{ padding: "7px 8px", color: "#4ade80" }}>{u.attendance_count}</td>
                                <td style={{ padding: "7px 8px", color: "#fbbf24", fontWeight: 700 }}>{u.expected_month_pts}</td>
                                <td style={{ padding: "7px 8px", color: "#60a5fa" }}>{u.current_lb_month_pts}</td>
                                <td style={{ padding: "7px 8px", fontWeight: 700, color: u.lb_drift > 0 ? "#f87171" : u.lb_drift < 0 ? "#fbbf24" : "#4ade80" }}>
                                  {u.lb_drift > 0 ? `+${u.lb_drift}` : u.lb_drift}
                                </td>
                                <td style={{ padding: "7px 8px", color: u.missing_att_ledger > 0 ? "#f87171" : "#4ade80" }}>{u.missing_att_ledger}</td>
                                <td style={{ padding: "7px 8px", color: u.missing_bonus_ledger > 0 ? "#fbbf24" : "#4ade80" }}>{u.missing_bonus_ledger}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {auditData.per_user.filter(u => u.lb_drift !== 0 || u.missing_att_ledger > 0 || u.missing_bonus_ledger > 0).length === 0 && (
                <div style={{ fontSize: 12, color: "#4ade80", padding: "8px 0" }}>
                  ✓ All users are in sync. No action needed.
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Summary stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Total Points Issued",  value: summaryLoad ? "…" : String(summary?.grand_total ?? 0),   icon: "🏆" },
          { label: "Active Members",       value: summaryLoad ? "…" : String(summary?.active_users ?? 0),  icon: "👥" },
          { label: "Attendance Points",    value: summaryLoad ? "…" : String(summary?.by_category.find(c => c.category === "attendance")?.points ?? 0),    icon: "🏃" },
          { label: "Weekly Bonuses",       value: summaryLoad ? "…" : String(summary?.by_category.find(c => c.category === "weekly_bonus")?.points ?? 0),  icon: "🏆" },
          { label: "Challenge Points",     value: summaryLoad ? "…" : String(summary?.by_category.find(c => c.category === "challenge")?.points ?? 0),     icon: "🎯" },
          { label: "Admin Adjustments",    value: summaryLoad ? "…" : String(summary?.by_category.find(c => c.category === "admin_adjustment")?.points ?? 0), icon: "⚙️" },
        ].map(s => (
          <Card key={s.label}>
            <CardBody style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#e8620a" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* ── Two-column: Top earners + Award/Deduct form ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>

        {/* Top earners */}
        <Card>
          <CardBody style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Top Earners — This Month</div>
            {summaryLoad ? (
              [1,2,3,4,5].map(i => <Skeleton key={i} style={{ height: 36, marginBottom: 8 }} />)
            ) : (summary?.top_earners ?? []).map((e) => (
              <div key={e.user_email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", minWidth: 28 }}>#{e.rank}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{e.user_name}</div>
                    <div style={{ fontSize: 10, color: "#555" }}>{e.user_email}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>{e.month_points} pts</div>
                  <div style={{ fontSize: 10, color: "#555" }}>total: {e.total_points}</div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Award / Deduct form */}
        <Card>
          <CardBody style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Award / Deduct Points</div>

            {adjMsg && (
              <Alert
                variant={adjMsg.type === "success" ? "success" : "error"}
                style={{ marginBottom: 14 }}
              >
                {adjMsg.text}
              </Alert>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {ADJUST_CATEGORIES.map(o => (
                <button
                  key={o.value}
                  onClick={() => setAdjMode(o.value as "award" | "deduct")}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 8, border: "1px solid",
                    borderColor: adjMode === o.value ? "#e8620a" : "rgba(255,255,255,0.1)",
                    background:  adjMode === o.value ? "rgba(232,98,10,0.12)" : "transparent",
                    color:       adjMode === o.value ? "#e8620a" : "#888",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Input
                placeholder="User email address"
                value={adjEmail}
                onChange={e => setAdjEmail(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Points (e.g. 5)"
                value={adjPoints}
                min={1}
                onChange={e => setAdjPoints(e.target.value)}
              />
              <Input
                placeholder="Reason (required)"
                value={adjReason}
                onChange={e => setAdjReason(e.target.value)}
              />
              <Textarea
                placeholder="Notes / comments (optional)"
                value={adjNotes}
                onChange={e => setAdjNotes(e.target.value)}
                rows={2}
              />
              <Button
                onClick={submitAdjustment}
                loading={adjLoading}
                disabled={adjLoading || !adjEmail || !adjPoints || !adjReason}
                style={{ width: "100%" }}
              >
                {adjMode === "award" ? "Award Points" : "Deduct Points"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── Points history with filters ── */}
      <Card>
        <CardBody style={{ padding: 0 }}>
          <div style={{ padding: "18px 20px 14px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Full Points History</div>

            {/* Filters */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto auto", gap: 8, alignItems: "flex-end" }}>
              <Input
                placeholder="Filter by email"
                value={filterEmail}
                onChange={e => setFilterEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyFilters()}
              />
              <Select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
              >
                <option value="">All categories</option>
                <option value="attendance">Attendance</option>
                <option value="weekly_bonus">Weekly Bonus</option>
                <option value="bonus">Admin Bonus</option>
                <option value="challenge">Challenge</option>
                <option value="referral">Referral</option>
                <option value="admin_adjustment">Admin Adjustment</option>
              </Select>
              <Input type="date" placeholder="From" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
              <Input type="date" placeholder="To"   value={filterTo}   onChange={e => setFilterTo(e.target.value)}   />
              <Button onClick={applyFilters} variant="primary" style={{ whiteSpace: "nowrap" }}>Filter</Button>
              <Button onClick={clearFilters} variant="ghost"   style={{ whiteSpace: "nowrap" }}>Clear</Button>
            </div>
          </div>

          {/* Table header */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{
            display: "grid",
            gridTemplateColumns: "100px 1fr 1fr 1fr 70px 100px",
            gap: 8, padding: "10px 20px",
            fontSize: 10, fontWeight: 700,
            color: "#555", textTransform: "uppercase", letterSpacing: "0.08em",
            background: "rgba(255,255,255,0.02)",
          }}>
            <span>Date</span>
            <span>Member</span>
            <span>Category</span>
            <span>Session</span>
            <span style={{ textAlign: "right" }}>Points</span>
            <span>By</span>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Rows */}
          {historyLoad ? (
            <div style={{ padding: "0 20px" }}>
              {[1,2,3,4,5,6,7].map(i => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr 70px 100px", gap: 8, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                </div>
              ))}
            </div>
          ) : !(history?.transactions.length) ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#555", fontSize: 13 }}>
              No transactions found.
            </div>
          ) : (
            <div style={{ padding: "0 20px" }}>
              {history!.transactions.map((tx, idx) => (
                <div
                  key={tx.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 1fr 1fr 70px 100px",
                    gap: 8,
                    padding: "11px 0",
                    borderBottom: idx < history!.transactions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#666" }}>{fmtDate(tx.created_at)}</span>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.user_name}</div>
                    <div style={{ fontSize: 10, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.user_email}</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{CATEGORY_ICONS[tx.category] ?? "✦"}</span>
                    <Badge style={{ fontSize: 10, background: `${CATEGORY_COLORS[tx.category] ?? "#888"}22`, color: CATEGORY_COLORS[tx.category] ?? "#888", border: "none" }}>
                      {tx.category_label}
                    </Badge>
                  </div>

                  <span style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.session_title ?? "—"}
                  </span>

                  <span style={{
                    fontSize: 14, fontWeight: 700, textAlign: "right",
                    color: tx.points >= 0 ? (CATEGORY_COLORS[tx.category] ?? "#4ade80") : "#f87171",
                  }}>
                    {tx.points >= 0 ? "+" : ""}{tx.points}
                  </span>

                  <span style={{ fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.awarded_by ?? "system"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {(history?.total_pages ?? 0) > 1 && (
            <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <Pagination
                page={histPage}
                totalPages={history!.total_pages}
                onChange={pg => { setHistPage(pg); loadHistory(pg); }}
              />
            </div>
          )}
          {(history?.total_count ?? 0) > 0 && (
            <div style={{ padding: "4px 20px 16px", fontSize: 11, color: "#555" }}>
              {history!.total_count} total transaction{history!.total_count !== 1 ? "s" : ""}
            </div>
          )}
        </CardBody>
      </Card>
      {/* ── Weekly Bonus Audit ── */}
      <Card style={{ marginTop: 28 }}>
        <CardBody style={{ padding: "18px 20px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
                Weekly Bonus Audit — {currentMonth()}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                Per-week, per-user breakdown. Read-only — no data is modified.
              </div>
            </div>
            <Button variant="ghost" onClick={runWBA} loading={wbaLoading} disabled={wbaLoading}>
              Run Weekly Bonus Audit
            </Button>
          </div>

          {wbaMsg && (
            <Alert variant="error" style={{ marginBottom: 14 }}>{wbaMsg}</Alert>
          )}

          {wbaData && (
            <>
              {/* Warning if week_key column missing */}
              {!wbaData.week_key_column_exists && (
                <Alert variant="error" style={{ marginBottom: 14 }}>
                  {wbaData.note}
                </Alert>
              )}

              {/* Summary stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Sessions",          value: wbaData.summary.total_sessions_in_month,     color: "#60a5fa" },
                  { label: "Members Active",    value: wbaData.summary.total_users_with_attendance, color: "#4ade80" },
                  { label: "Eligible Users",    value: wbaData.summary.total_users_eligible,        color: "#fbbf24" },
                  { label: "Bonuses Expected",  value: wbaData.summary.total_bonuses_expected,      color: "#fbbf24" },
                  { label: "Bonuses Awarded",   value: wbaData.summary.total_bonuses_awarded,       color: wbaData.summary.total_bonuses_awarded === wbaData.summary.total_bonuses_expected ? "#4ade80" : "#f87171" },
                  { label: "Discrepancies",     value: wbaData.summary.discrepancies,               color: wbaData.summary.discrepancies === 0 ? "#4ade80" : "#f87171" },
                ].map(s => (
                  <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-week breakdown */}
              {wbaData.weeks.map(week => {
                const hasIssues = week.users.some(u => u.bonus_eligible && u.bonus_awarded === false);
                const isOpen    = expandedWeeks.has(week.week_start);
                const eligible  = week.users.filter(u => u.bonus_eligible);

                return (
                  <div key={week.week_start} style={{ marginBottom: 8, border: `1px solid ${hasIssues ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, overflow: "hidden" }}>

                    {/* Week header row */}
                    <button
                      onClick={() => toggleWeek(week.week_start)}
                      style={{ width: "100%", background: hasIssues ? "rgba(248,113,113,0.06)" : "rgba(255,255,255,0.02)", border: "none", cursor: "pointer", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontFamily: "inherit" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{week.week_label}</span>
                        <span style={{ fontSize: 11, color: "#555" }}>{week.total_users_attending} attending</span>
                        {eligible.length > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: hasIssues ? "#f87171" : "#4ade80" }}>
                            {week.users_awarded_bonus}/{eligible.length} bonuses awarded
                          </span>
                        )}
                        {eligible.length === 0 && (
                          <span style={{ fontSize: 11, color: "#555" }}>No one eligible</span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: "#555" }}>{isOpen ? "▲" : "▼"}</span>
                    </button>

                    {/* Expanded user table */}
                    {isOpen && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                              {["Member", "Sessions", "Dates", "Att. Pts", "Eligible", "Bonus Awarded", "Notes"].map(h => (
                                <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {week.users
                              .filter(u => wbaShowAll || u.bonus_eligible || u.sessions_in_week >= 2)
                              .sort((a, b) => b.sessions_in_week - a.sessions_in_week)
                              .map(u => (
                                <tr key={u.email} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: u.bonus_eligible && u.bonus_awarded === false ? "rgba(248,113,113,0.04)" : "transparent" }}>
                                  <td style={{ padding: "9px 12px" }}>
                                    <div style={{ fontWeight: 600, color: "#fff" }}>{u.name}</div>
                                    <div style={{ color: "#555", fontSize: 10 }}>{u.email}</div>
                                  </td>
                                  <td style={{ padding: "9px 12px", fontWeight: 700, color: u.sessions_in_week >= 4 ? "#fbbf24" : "#aaa" }}>
                                    {u.sessions_in_week}
                                  </td>
                                  <td style={{ padding: "9px 12px", color: "#888", maxWidth: 200 }}>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                      {u.attendance_dates.map((d, i) => (
                                        <span key={d} title={u.session_titles[i]} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "2px 6px", fontSize: 10, whiteSpace: "nowrap" }}>
                                          {new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td style={{ padding: "9px 12px", color: "#4ade80", fontWeight: 600 }}>+{u.attendance_pts}</td>
                                  <td style={{ padding: "9px 12px" }}>
                                    {u.bonus_eligible
                                      ? <span style={{ color: "#fbbf24", fontWeight: 700 }}>Yes</span>
                                      : <span style={{ color: "#555" }}>No</span>}
                                  </td>
                                  <td style={{ padding: "9px 12px" }}>
                                    {u.bonus_awarded === null && <span style={{ color: "#555" }}>N/A</span>}
                                    {u.bonus_awarded === true  && <span style={{ color: "#4ade80", fontWeight: 700 }}>✓ Yes</span>}
                                    {u.bonus_awarded === false && <span style={{ color: "#f87171", fontWeight: 700 }}>✗ Missing</span>}
                                  </td>
                                  <td style={{ padding: "9px 12px", color: "#666", fontSize: 10 }}>
                                    {u.reason ?? "—"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {week.users.some(u => !u.bonus_eligible && u.sessions_in_week < 2) && (
                          <button
                            onClick={() => setWbaShowAll(p => !p)}
                            style={{ fontSize: 11, color: "#555", background: "none", border: "none", cursor: "pointer", padding: "8px 12px" }}
                          >
                            {wbaShowAll ? "Show fewer rows" : `Show all ${week.total_users_attending} members`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Discrepancies list */}
              {wbaData.discrepancies.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 10 }}>
                    {wbaData.discrepancies.length} Discrepanc{wbaData.discrepancies.length !== 1 ? "ies" : "y"} Found
                  </div>
                  {wbaData.discrepancies.map((d, i) => (
                    <div key={i} style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                        <div>
                          <span style={{ fontWeight: 700, color: "#fff" }}>{d.name}</span>
                          <span style={{ color: "#555", fontSize: 11, marginLeft: 8 }}>{d.email}</span>
                        </div>
                        <span style={{ fontSize: 11, color: "#fbbf24" }}>{d.week_label} · {d.sessions_count} sessions</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#f87171", marginBottom: 6 }}>
                        Root cause: {d.root_cause}
                      </div>
                      <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "8px 10px", wordBreak: "break-all" }}>
                        Fix: {d.fix}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {wbaData.discrepancies.length === 0 && wbaData.summary.total_bonuses_expected > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#4ade80" }}>
                  ✓ All eligible bonuses have been awarded correctly.
                </div>
              )}

              {wbaData.summary.total_bonuses_expected === 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                  No user has attended 4+ sessions in a single week this month yet.
                </div>
              )}

              <div style={{ marginTop: 10, fontSize: 10, color: "#444" }}>
                Generated at {new Date(wbaData.generated_at).toLocaleString("en-IN")} · Showing sessions within {wbaData.month} only
              </div>
            </>
          )}
        </CardBody>
      </Card>

    </div>
  );
}
