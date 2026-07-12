"use client";

import { useState, useEffect, useCallback } from "react";

interface BugReport {
  id: string;
  user_email: string | null;
  user_name:  string | null;
  user_phone: string | null;
  category:   string;
  description: string;
  screenshot_url: string | null;
  browser:     string | null;
  device:      string | null;
  screen_size: string | null;
  app_version: string | null;
  current_url: string | null;
  console_errors: string | null;
  status:      string;
  priority:    string;
  assigned_to: string | null;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at:  string;
  updated_at:  string;
}

const STATUS_OPTIONS  = ["open", "investigating", "fixed", "released", "closed"];
const PRIORITY_OPTIONS= ["critical", "high", "medium", "low"];
const CATEGORY_LABELS: Record<string, string> = {
  bug: "🐛 Bug", ui: "🎨 UI", payment: "💳 Payment",
  session: "📅 Session", event: "🏁 Event",
  feature: "✨ Feature", performance: "⚡ Performance",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open:          { bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  investigating: { bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  fixed:         { bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  released:      { bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
  closed:        { bg: "rgba(100,116,139,0.15)", color: "#64748b" },
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  critical: { bg: "rgba(239,68,68,0.2)",   color: "#ef4444" },
  high:     { bg: "rgba(234,179,8,0.15)",   color: "#f59e0b" },
  medium:   { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
  low:      { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Badge({ label, colors }: { label: string; colors: { bg: string; color: string } }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: colors.bg, color: colors.color, textTransform: "uppercase", letterSpacing: "0.06em",
    }}>{label}</span>
  );
}

function ScreenshotLink({ path }: { path: string }) {
  const [url,     setUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function open() {
    // If it's already a full URL (legacy), open directly
    if (path.startsWith("http")) { window.open(path, "_blank"); return; }
    setLoading(true); setError("");
    const res = await fetch(`/api/admin/bug-reports/screenshot?path=${encodeURIComponent(path)}`).catch(() => null);
    setLoading(false);
    if (!res?.ok) { setError("Could not load screenshot"); return; }
    const { signedUrl } = await res.json();
    setUrl(signedUrl);
    window.open(signedUrl, "_blank");
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Screenshot</div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#e8620a", fontSize: "0.82rem" }}>View screenshot →</a>
      ) : (
        <button onClick={open} disabled={loading}
          style={{ background: "none", border: "none", color: loading ? "#555" : "#e8620a", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.82rem", padding: 0, fontFamily: "inherit" }}>
          {loading ? "Loading…" : "View screenshot →"}
        </button>
      )}
      {error && <div style={{ fontSize: "0.72rem", color: "#f87171", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function DetailModal({ report, onClose, onUpdate }: {
  report: BugReport;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<BugReport>) => void;
}) {
  const [status,     setStatus]     = useState(report.status);
  const [priority,   setPriority]   = useState(report.priority);
  const [assignedTo, setAssignedTo] = useState(report.assigned_to ?? "");
  const [adminNotes, setAdminNotes] = useState(report.admin_notes ?? "");
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/admin/bug-reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: report.id, status, priority, assigned_to: assignedTo, admin_notes: adminNotes }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate(report.id, { status, priority, assigned_to: assignedTo || null, admin_notes: adminNotes || null });
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 4 }}>
              {CATEGORY_LABELS[report.category] ?? report.category}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#555" }}>{fmtDate(report.created_at)}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {/* Reporter */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reporter</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>{report.user_name || "Anonymous"}</div>
          {report.user_email && <div style={{ fontSize: "0.78rem", color: "#888", marginTop: 2 }}>{report.user_email}</div>}
          {report.user_phone && <div style={{ fontSize: "0.78rem", color: "#888", marginTop: 2 }}>{report.user_phone}</div>}
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</div>
          <div style={{ fontSize: "0.85rem", color: "#ddd", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 14px" }}>
            {report.description}
          </div>
        </div>

        {/* Technical Info */}
        <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["URL",      report.current_url],
            ["Browser",  report.browser?.split(" — ")[0]],
            ["Device",   report.device],
            ["Screen",   report.screen_size],
            ["Version",  report.app_version],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label as string} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: "0.65rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: "0.75rem", color: "#aaa", wordBreak: "break-all" }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Screenshot */}
        {report.screenshot_url && (
          <ScreenshotLink path={report.screenshot_url} />
        )}

        {/* Console Errors */}
        {report.console_errors && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Console Errors</div>
            <pre style={{ fontSize: "0.7rem", color: "#f87171", background: "rgba(239,68,68,0.06)", borderRadius: 6, padding: "8px 10px", overflowX: "auto", whiteSpace: "pre-wrap", margin: 0 }}>
              {report.console_errors.slice(0, 400)}
            </pre>
          </div>
        )}

        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "20px 0" }} />

        {/* Admin Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit" }}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit" }}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Assigned To</label>
          <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name or email"
            style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Admin Notes</label>
          <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3} placeholder="Internal notes, resolution details…"
            style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            width: "100%", padding: "11px",
            background: saved ? "rgba(34,197,94,0.2)" : saving ? "rgba(232,98,10,0.4)" : "var(--cs-orange, #e8620a)",
            color: saved ? "#22c55e" : "#fff", border: saved ? "1px solid rgba(34,197,94,0.4)" : "none",
            borderRadius: 9, fontSize: "0.875rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

export default function BugReportsPage() {
  const [reports,    setReports]    = useState<BugReport[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page,       setPage]       = useState(1);
  const [total,      setTotal]      = useState(0);
  const [selected,   setSelected]   = useState<BugReport | null>(null);

  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ status: statusFilter, category: categoryFilter, page: String(page) });
      const res  = await fetch(`/api/admin/bug-reports?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
      setReports(data.reports ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [statusFilter, categoryFilter, page]);

  useEffect(() => { load(); }, [load]);

  function handleUpdate(id: string, patch: Partial<BugReport>) {
    setReports(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    if (selected?.id === id) setSelected(s => s ? { ...s, ...patch } : s);
  }

  // Summary counts by status
  const counts = reports.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const openCount       = counts["open"]          ?? 0;
  const investigatingC  = counts["investigating"] ?? 0;

  return (
    <div style={{ padding: "20px 20px 40px", maxWidth: 1100, margin: "0 auto" }}>
      {selected && (
        <DetailModal
          report={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>🐛 Bug Reports</h1>
        <p style={{ fontSize: "0.82rem", color: "#666", margin: "4px 0 0" }}>Issues submitted by users via the in-app bug reporter</p>
      </div>

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Open",          value: openCount,      color: "#ef4444" },
          { label: "Investigating", value: investigatingC, color: "#eab308" },
          { label: "Total",         value: total,          color: "#e8620a" },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "0.72rem", color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ddd", fontSize: "0.8rem", fontFamily: "inherit" }}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        <select
          value={categoryFilter}
          onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ddd", fontSize: "0.8rem", fontFamily: "inherit" }}>
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <button onClick={() => load()}
          style={{ padding: "7px 14px", background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 7, color: "#e8620a", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", fontSize: "0.82rem", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#444" }}>Loading…</div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#444", fontSize: "0.9rem" }}>
          No reports found
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Category", "Description", "User", "Priority", "Status", "Date", ""].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: "0.68rem", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontSize: "0.78rem", color: "#ddd" }}>{CATEGORY_LABELS[r.category] ?? r.category}</span>
                    </td>
                    <td style={{ padding: "10px", maxWidth: 280 }}>
                      <div style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.description}
                      </div>
                    </td>
                    <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#aaa", fontSize: "0.75rem" }}>{r.user_name || "—"}</div>
                      <div style={{ color: "#555", fontSize: "0.68rem" }}>{r.user_email || ""}</div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge label={r.priority} colors={PRIORITY_COLORS[r.priority] ?? { bg: "#111", color: "#888" }} />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge label={r.status} colors={STATUS_COLORS[r.status] ?? { bg: "#111", color: "#888" }} />
                    </td>
                    <td style={{ padding: "10px", color: "#555", whiteSpace: "nowrap", fontSize: "0.72rem" }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontSize: "0.72rem", color: "#e8620a" }}>View →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: page === 1 ? "#333" : "#aaa", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>
                ← Prev
              </button>
              <span style={{ fontSize: "0.78rem", color: "#666" }}>
                Page {page} of {Math.ceil(total / LIMIT)} ({total} reports)
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * LIMIT >= total}
                style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: page * LIMIT >= total ? "#333" : "#aaa", cursor: page * LIMIT >= total ? "not-allowed" : "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
