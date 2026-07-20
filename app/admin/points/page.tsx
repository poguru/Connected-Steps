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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPointsPage() {
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
    </div>
  );
}
