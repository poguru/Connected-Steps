"use client";

import { useState, useEffect, useCallback } from "react";

interface Attachment { path: string; type: string; name: string; size: number; }

interface HistoryEntry {
  id:            string;
  status:        string;
  changed_by:    string;
  changed_at:    string;
  comment:       string | null;
}

interface BugReport {
  id:              string;
  user_id:         string | null;
  user_email:      string | null;
  user_name:       string | null;
  user_phone:      string | null;
  membership_type: string | null;
  title:           string | null;
  category:        string;
  severity:        string | null;
  description:     string;
  screenshot_url:  string | null;
  attachments:     Attachment[] | null;
  browser:         string | null;
  device:          string | null;
  os:              string | null;
  screen_size:     string | null;
  app_version:     string | null;
  current_url:     string | null;
  console_errors:  string | null;
  status:          string;
  priority:        string;
  assigned_to:     string | null;
  admin_notes:     string | null;
  internal_notes:  string | null;
  resolution_summary: string | null;
  version_fixed:   string | null;
  resolved_at:     string | null;
  created_at:      string;
  updated_at:      string;
}

const STATUS_OPTIONS   = ["new", "acknowledged", "in_progress", "testing", "resolved", "closed"];
const STATUS_LABELS: Record<string, string> = {
  new: "New", acknowledged: "Acknowledged", in_progress: "In Progress",
  testing: "Testing", resolved: "Resolved", closed: "Closed",
};
const PRIORITY_OPTIONS = ["critical", "high", "medium", "low"];
const CATEGORY_LABELS: Record<string, string> = {
  bug: "🐛 Bug", ui: "🎨 UI", payment: "💳 Payment",
  session: "📅 Session", event: "🏁 Event",
  feature: "✨ Feature", performance: "⚡ Performance",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new:          { bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  acknowledged: { bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  in_progress:  { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  testing:      { bg: "rgba(139,92,246,0.15)",  color: "#a78bfa" },
  resolved:     { bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  closed:       { bg: "rgba(100,116,139,0.15)", color: "#64748b" },
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  critical: { bg: "rgba(239,68,68,0.2)",   color: "#ef4444" },
  high:     { bg: "rgba(234,179,8,0.15)",  color: "#f59e0b" },
  medium:   { bg: "rgba(59,130,246,0.12)", color: "#60a5fa" },
  low:      { bg: "rgba(100,116,139,0.12)",color: "#94a3b8" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Badge({ label, colors }: { label: string; colors: { bg: string; color: string } }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: colors.bg, color: colors.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {label.replace("_", " ")}
    </span>
  );
}

function AttachmentGallery({ report }: { report: BugReport }) {
  const paths: string[] = report.attachments?.length
    ? report.attachments.map(a => a.path)
    : report.screenshot_url ? [report.screenshot_url] : [];

  const [signedUrls,  setSignedUrls]  = useState<Record<string, string>>({});
  const [loading,     setLoading]     = useState<Record<string, boolean>>({});
  const [loadError,   setLoadError]   = useState<Record<string, boolean>>({});
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (paths.length === 0) return null;

  async function resolve(path: string) {
    if (path.startsWith("http")) return path;
    if (signedUrls[path]) return signedUrls[path];
    setLoading(l => ({ ...l, [path]: true }));
    const res = await fetch(`/api/admin/bug-reports/screenshot?path=${encodeURIComponent(path)}`).catch(() => null);
    setLoading(l => ({ ...l, [path]: false }));
    if (!res?.ok) { setLoadError(e => ({ ...e, [path]: true })); return null; }
    const { signedUrl } = await res.json() as { signedUrl: string };
    setSignedUrls(u => ({ ...u, [path]: signedUrl }));
    return signedUrl;
  }

  async function openLightbox(idx: number) { const url = await resolve(paths[idx]); if (url) setLightboxIdx(idx); }

  async function download(path: string, idx: number) {
    const url = await resolve(path);
    if (!url) return;
    const a = document.createElement("a"); a.href = url;
    a.download = report.attachments?.[idx]?.name ?? path.split("/").pop() ?? `screenshot-${idx + 1}.png`;
    a.click();
  }

  const navBtn: React.CSSProperties = { padding: "8px 16px", background: "rgba(232,98,10,0.2)", border: "1px solid rgba(232,98,10,0.35)", borderRadius: 8, color: "#e8620a", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Screenshots ({paths.length})</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {paths.map((path, idx) => (
          <div key={path} style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
            {signedUrls[path] ? (
              <img src={signedUrls[path]} alt={`Screenshot ${idx + 1}`} onClick={() => setLightboxIdx(idx)}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)" }} />
            ) : (
              <button onClick={() => openLightbox(idx)} disabled={!!loading[path] || !!loadError[path]}
                style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${loadError[path] ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, cursor: loadError[path] ? "default" : "pointer", color: loadError[path] ? "#f87171" : "#555", fontSize: "1.4rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {loading[path] ? "⏳" : loadError[path] ? "✕" : "🖼"}
              </button>
            )}
            {signedUrls[path] && (
              <button onClick={e => { e.stopPropagation(); void download(path, idx); }} title="Download"
                style={{ position: "absolute", bottom: -1, right: -1, width: 22, height: 22, borderRadius: "50%", background: "rgba(30,30,30,0.9)", border: "1px solid rgba(255,255,255,0.15)", color: "#aaa", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>⬇</button>
            )}
          </div>
        ))}
      </div>
      {lightboxIdx !== null && (
        <div onClick={() => setLightboxIdx(null)}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          {signedUrls[paths[lightboxIdx]] ? (
            <img src={signedUrls[paths[lightboxIdx]]} alt="" onClick={e => e.stopPropagation()}
              style={{ maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain", borderRadius: 8 }} />
          ) : <div style={{ color: "#555" }}>Loading…</div>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
            {lightboxIdx > 0 && <button onClick={() => openLightbox(lightboxIdx - 1)} style={navBtn}>← Prev</button>}
            {signedUrls[paths[lightboxIdx]] && <button onClick={() => download(paths[lightboxIdx], lightboxIdx)} style={navBtn}>⬇ Download</button>}
            {lightboxIdx < paths.length - 1 && <button onClick={() => openLightbox(lightboxIdx + 1)} style={navBtn}>Next →</button>}
            <button onClick={() => setLightboxIdx(null)} style={{ ...navBtn, background: "rgba(255,255,255,0.06)" }}>✕ Close</button>
          </div>
          {paths.length > 1 && <div style={{ fontSize: "0.75rem", color: "#555" }}>{lightboxIdx + 1} / {paths.length}</div>}
        </div>
      )}
    </div>
  );
}

function HistoryTimeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Audit Trail</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {history.map((h, i) => (
          <div key={h.id} style={{ display: "flex", gap: 12, paddingBottom: i < history.length - 1 ? 12 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: (STATUS_COLORS[h.status] ?? { color: "#555" }).color, flexShrink: 0, marginTop: 3 }} />
              {i < history.length - 1 && <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.08)", marginTop: 4 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Badge label={STATUS_LABELS[h.status] ?? h.status} colors={STATUS_COLORS[h.status] ?? { bg: "#222", color: "#888" }} />
                <span style={{ fontSize: "0.68rem", color: "#555" }}>{h.changed_by}</span>
                <span style={{ fontSize: "0.68rem", color: "#444" }}>{fmtDate(h.changed_at)}</span>
              </div>
              {h.comment && (
                <div style={{ fontSize: "0.72rem", color: "#888", marginTop: 4, fontStyle: "italic" }}>{h.comment}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailModal({ report: initialReport, onClose, onUpdate }: {
  report:   BugReport;
  onClose:  () => void;
  onUpdate: (id: string, patch: Partial<BugReport>) => void;
}) {
  const [report,     setReport]     = useState(initialReport);
  const [history,    setHistory]    = useState<HistoryEntry[]>([]);
  const [histLoading,setHistLoading]= useState(true);

  const [status,            setStatus]            = useState(report.status);
  const [priority,          setPriority]          = useState(report.priority);
  const [assignedTo,        setAssignedTo]        = useState(report.assigned_to        ?? "");
  const [adminNotes,        setAdminNotes]        = useState(report.admin_notes        ?? "");
  const [resolutionSummary, setResolutionSummary] = useState(report.resolution_summary ?? "");
  const [versionFixed,      setVersionFixed]      = useState(report.version_fixed      ?? "");
  const [internalNotes,     setInternalNotes]     = useState(report.internal_notes     ?? "");
  const [comment,           setComment]           = useState("");
  const [saving,            setSaving]            = useState(false);
  const [saved,             setSaved]             = useState(false);
  const [saveError,         setSaveError]         = useState("");
  const [activeTab,         setActiveTab]         = useState<"details" | "admin">("details");

  const requiresResolution = status === "resolved" || status === "closed";

  useEffect(() => {
    fetch(`/api/admin/bug-reports?id=${report.id}`)
      .then(r => r.json())
      .then(d => { if (d.history) setHistory(d.history); })
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [report.id]);

  async function save() {
    if (requiresResolution && !resolutionSummary.trim()) {
      setSaveError("Resolution Summary is required when marking as Resolved or Closed.");
      return;
    }
    setSaving(true); setSaveError("");
    const res = await fetch("/api/admin/bug-reports", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: report.id, status, priority,
        assigned_to:       assignedTo,
        admin_notes:       adminNotes,
        resolution_summary: resolutionSummary,
        version_fixed:     versionFixed,
        internal_notes:    internalNotes,
        comment:           comment || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveError(data.error ?? "Save failed"); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    const patch: Partial<BugReport> = { status, priority, assigned_to: assignedTo || null, admin_notes: adminNotes || null, resolution_summary: resolutionSummary || null, version_fixed: versionFixed || null };
    onUpdate(report.id, patch);
    setReport(r => ({ ...r, ...patch }));
    if (comment) {
      setHistory(h => [...h, { id: Date.now().toString(), status, changed_by: "admin", changed_at: new Date().toISOString(), comment }]);
      setComment("");
    }
  }

  const tabBtn = (tab: "details" | "admin", label: string) => (
    <button onClick={() => setActiveTab(tab)} type="button" style={{ padding: "7px 16px", background: activeTab === tab ? "rgba(232,98,10,0.2)" : "transparent", border: activeTab === tab ? "1px solid rgba(232,98,10,0.4)" : "1px solid transparent", borderRadius: 7, color: activeTab === tab ? "#e8620a" : "#666", fontSize: "0.78rem", fontFamily: "inherit", cursor: "pointer", fontWeight: activeTab === tab ? 700 : 400 }}>
      {label}
    </button>
  );

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 660, maxHeight: "92vh", overflowY: "auto", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
            {report.title && <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 4, wordBreak: "break-word" }}>{report.title}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.8rem", color: "#ccc" }}>{CATEGORY_LABELS[report.category] ?? report.category}</span>
              {report.severity && <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(232,98,10,0.15)", color: "#e8620a", textTransform: "capitalize" }}>{report.severity}</span>}
              <Badge label={report.priority} colors={PRIORITY_COLORS[report.priority] ?? { bg: "#111", color: "#888" }} />
              <Badge label={STATUS_LABELS[report.status] ?? report.status} colors={STATUS_COLORS[report.status] ?? { bg: "#111", color: "#888" }} />
            </div>
            <div style={{ fontSize: "0.72rem", color: "#555", marginTop: 3 }}>{fmtDate(report.created_at)}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {tabBtn("details", "Report Details")}
          {tabBtn("admin",   "Admin Controls")}
        </div>

        {activeTab === "details" && (
          <>
            {/* Reporter */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reporter</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>{report.user_name || "Anonymous"}</div>
                  {report.user_email && (
                    <div style={{ fontSize: "0.78rem", color: "#888", marginTop: 2 }}>
                      <a href={`mailto:${report.user_email}`} style={{ color: "#888", textDecoration: "none" }}>{report.user_email}</a>
                    </div>
                  )}
                  {report.user_phone && <div style={{ fontSize: "0.78rem", color: "#888", marginTop: 1 }}>{report.user_phone}</div>}
                  {report.membership_type && (
                    <div style={{ fontSize: "0.72rem", color: "#e8620a", marginTop: 4, fontWeight: 600 }}>🏅 {report.membership_type} membership</div>
                  )}
                </div>
                {report.user_email && (
                  <a href={`/admin/users?search=${encodeURIComponent(report.user_email)}`}
                    style={{ fontSize: "0.72rem", color: "#e8620a", textDecoration: "none", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 6, padding: "4px 10px", whiteSpace: "nowrap" }}>
                    View Profile →
                  </a>
                )}
              </div>
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
                ["OS",       report.os],
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

            <AttachmentGallery report={report} />

            {report.console_errors && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Console Errors</div>
                <pre style={{ fontSize: "0.7rem", color: "#f87171", background: "rgba(239,68,68,0.06)", borderRadius: 6, padding: "8px 10px", overflowX: "auto", whiteSpace: "pre-wrap", margin: 0 }}>
                  {report.console_errors.slice(0, 400)}
                </pre>
              </div>
            )}

            {/* Resolution (visible to reporter) */}
            {report.resolution_summary && (
              <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: "0.75rem", color: "#22c55e", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Resolution</div>
                <div style={{ fontSize: "0.85rem", color: "#ddd", lineHeight: 1.6 }}>{report.resolution_summary}</div>
                {report.version_fixed && <div style={{ fontSize: "0.72rem", color: "#22c55e", marginTop: 4 }}>Fixed in: {report.version_fixed}</div>}
              </div>
            )}

            {/* History */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "16px 0" }} />
            {histLoading ? (
              <div style={{ fontSize: "0.75rem", color: "#444", padding: "8px 0" }}>Loading history…</div>
            ) : (
              <HistoryTimeline history={history} />
            )}
          </>
        )}

        {activeTab === "admin" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit" }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
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

            {/* Resolution fields — shown when resolving/closing */}
            <div style={{ background: requiresResolution ? "rgba(34,197,94,0.04)" : "transparent", border: requiresResolution ? "1px solid rgba(34,197,94,0.2)" : "none", borderRadius: 8, padding: requiresResolution ? "12px 14px" : 0, marginBottom: 14 }}>
              {requiresResolution && (
                <div style={{ fontSize: "0.72rem", color: "#22c55e", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Resolution Details (required)
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.72rem", color: requiresResolution ? "#22c55e" : "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Resolution Summary {requiresResolution && <span style={{ color: "#ef4444" }}>*</span>}
                  <span style={{ color: "#555", marginLeft: 6, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(visible to reporter)</span>
                </label>
                <textarea value={resolutionSummary} onChange={e => setResolutionSummary(e.target.value)} rows={2}
                  placeholder="Describe what was fixed and what the user should do…"
                  style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: `1px solid ${requiresResolution && !resolutionSummary ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Version Fixed</label>
                <input value={versionFixed} onChange={e => setVersionFixed(e.target.value)} placeholder="e.g. v2.4.1"
                  style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Internal Notes <span style={{ color: "#555", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(admin only)</span>
              </label>
              <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2}
                placeholder="Internal notes, root cause analysis, etc."
                style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Admin Notes</label>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2}
                placeholder="General admin notes…"
                style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.72rem", color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status Change Comment</label>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional note about this status change"
                style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            {saveError && (
              <div style={{ fontSize: "0.78rem", color: "#f87171", marginBottom: 10, background: "rgba(239,68,68,0.08)", borderRadius: 6, padding: "8px 10px" }}>{saveError}</div>
            )}

            <button onClick={save} disabled={saving}
              style={{ width: "100%", padding: "11px", background: saved ? "rgba(34,197,94,0.2)" : saving ? "rgba(232,98,10,0.4)" : "var(--cs-orange, #e8620a)", color: saved ? "#22c55e" : "#fff", border: saved ? "1px solid rgba(34,197,94,0.4)" : "none", borderRadius: 9, fontSize: "0.875rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {saved ? "✓ Saved & Notified" : saving ? "Saving…" : "Save Changes"}
            </button>
            <p style={{ fontSize: "0.7rem", color: "#444", textAlign: "center", marginTop: 8 }}>Reporter will be notified by email and in-app on every status change.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function BugReportsPage() {
  const [reports,        setReports]        = useState<BugReport[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search,         setSearch]         = useState("");
  const [searchInput,    setSearchInput]    = useState("");
  const [page,           setPage]           = useState(1);
  const [total,          setTotal]          = useState(0);
  const [selected,       setSelected]       = useState<BugReport | null>(null);

  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({
        status:   statusFilter,
        category: categoryFilter,
        priority: priorityFilter,
        search,
        page:     String(page),
      });
      const res  = await fetch(`/api/admin/bug-reports?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
      setReports(data.reports ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [statusFilter, categoryFilter, priorityFilter, search, page]);

  useEffect(() => { load(); }, [load]);

  function handleUpdate(id: string, patch: Partial<BugReport>) {
    setReports(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    if (selected?.id === id) setSelected(s => s ? { ...s, ...patch } : s);
  }

  const counts = reports.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  const selStyle: React.CSSProperties = { padding: "7px 10px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ddd", fontSize: "0.8rem", fontFamily: "inherit" };

  return (
    <div style={{ padding: "20px 20px 40px", maxWidth: 1200, margin: "0 auto" }}>
      {selected && (
        <DetailModal report={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate} />
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>🐛 Bug Reports</h1>
        <p style={{ fontSize: "0.82rem", color: "#666", margin: "4px 0 0" }}>Issues submitted by users — reporters are notified on every status change</p>
      </div>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 20 }}>
        {[
          { label: "New",         value: counts["new"]          ?? 0, color: "#ef4444" },
          { label: "In Progress", value: counts["in_progress"]  ?? 0, color: "#60a5fa" },
          { label: "Testing",     value: counts["testing"]      ?? 0, color: "#a78bfa" },
          { label: "Resolved",    value: counts["resolved"]     ?? 0, color: "#22c55e" },
          { label: "Total",       value: total,                        color: "#e8620a" },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "0.68rem", color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 0 }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, email, phone, title…"
            style={{ padding: "7px 12px", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRight: "none", borderRadius: "7px 0 0 7px", color: "#ddd", fontSize: "0.8rem", fontFamily: "inherit", width: 220 }}
          />
          <button type="submit" style={{ padding: "7px 12px", background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: "0 7px 7px 0", color: "#e8620a", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>🔍</button>
        </form>

        <select value={statusFilter}   onChange={e => { setStatusFilter(e.target.value);   setPage(1); }} style={selStyle}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }} style={selStyle}>
          <option value="all">All Priorities</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>

        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }} style={selStyle}>
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {(search || statusFilter !== "all" || priorityFilter !== "all" || categoryFilter !== "all") && (
          <button onClick={() => { setSearch(""); setSearchInput(""); setStatusFilter("all"); setPriorityFilter("all"); setCategoryFilter("all"); setPage(1); }}
            style={{ padding: "7px 12px", background: "rgba(100,116,139,0.15)", border: "1px solid rgba(100,116,139,0.3)", borderRadius: 7, color: "#94a3b8", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
            ✕ Clear
          </button>
        )}

        <button onClick={() => load()}
          style={{ padding: "7px 14px", background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 7, color: "#e8620a", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", fontSize: "0.82rem", marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#444" }}>Loading…</div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#444", fontSize: "0.9rem" }}>No reports found</div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Reporter", "Issue", "Category", "Priority", "Status", "Imgs", "Reported", "Updated"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: "0.68rem", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} onClick={() => setSelected(r)}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#ddd", fontSize: "0.8rem", fontWeight: 500 }}>{r.user_name || "Anonymous"}</div>
                      {r.user_email && <div style={{ color: "#555", fontSize: "0.68rem", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{r.user_email}</div>}
                      {r.user_phone && <div style={{ color: "#444", fontSize: "0.65rem" }}>{r.user_phone}</div>}
                      {r.membership_type && <div style={{ color: "#e8620a", fontSize: "0.62rem", marginTop: 2 }}>{r.membership_type}</div>}
                    </td>
                    <td style={{ padding: "10px", maxWidth: 220 }}>
                      {r.title && <div style={{ color: "#ddd", fontWeight: 600, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>{r.title}</div>}
                      <div style={{ color: r.title ? "#666" : "#ccc", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontSize: "0.78rem", color: "#ddd", whiteSpace: "nowrap" }}>{CATEGORY_LABELS[r.category] ?? r.category}</span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge label={r.priority} colors={PRIORITY_COLORS[r.priority] ?? { bg: "#111", color: "#888" }} />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge label={STATUS_LABELS[r.status] ?? r.status} colors={STATUS_COLORS[r.status] ?? { bg: "#111", color: "#888" }} />
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      {(r.attachments?.length ?? 0) > 0
                        ? <span style={{ fontSize: "0.72rem", color: "#e8620a", fontWeight: 600 }}>{r.attachments!.length}🖼</span>
                        : r.screenshot_url ? <span style={{ fontSize: "0.72rem", color: "#666" }}>1🖼</span>
                        : <span style={{ fontSize: "0.72rem", color: "#333" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px", color: "#555", whiteSpace: "nowrap", fontSize: "0.72rem" }}>{fmtDate(r.created_at)}</td>
                    <td style={{ padding: "10px", color: "#444", whiteSpace: "nowrap", fontSize: "0.72rem" }}>{fmtDate(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > LIMIT && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: page === 1 ? "#333" : "#aaa", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>← Prev</button>
              <span style={{ fontSize: "0.78rem", color: "#666" }}>Page {page} of {Math.ceil(total / LIMIT)} ({total} reports)</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total}
                style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: page * LIMIT >= total ? "#333" : "#aaa", cursor: page * LIMIT >= total ? "not-allowed" : "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
