"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";

type LogEntry = {
  id: string; actor_email: string; actor_role: string;
  action: string; entity_type: string | null; entity_id: string | null;
  detail: Record<string, unknown> | null; created_at: string;
};

const ACTION_COLOR: Record<string, string> = {
  update_event: "#6366f1", update_category: ACCENT,
  create_staff: "#10b981", update_staff: "#f59e0b", activate_staff: "#10b981",
  deactivate_staff: "#ef4444", reset_staff_password: "#f59e0b",
  resend_email: "#60a5fa", force_resend_email: "#f59e0b",
};
function actionColor(a: string) { return ACTION_COLOR[a] ?? "#888"; }

const KNOWN_ACTIONS = [
  "update_event","update_category","create_staff","update_staff",
  "activate_staff","deactivate_staff","reset_staff_password",
  "resend_email","force_resend_email",
];

export default function AuditLogsPage() {
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [actor,   setActor]   = useState("");
  const [action,  setAction]  = useState("");
  const [offset,  setOffset]  = useState(0);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (actor)  params.set("actor",  actor);
    if (action) params.set("action", action);
    fetch(`/api/it-run/admin/audit-logs?${params}`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [actor, action, offset]);

  useEffect(() => { load(); }, [load]);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
  }

  function fmtTime(ts: string) {
    return new Date(ts).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Audit Logs</h1>
        <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>
          Every write action performed through the Event Admin Portal. {total ? `${total} total entries.` : ""}
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilter} style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={actor} onChange={e => setActor(e.target.value)} placeholder="Filter by actor email…"
          style={{ flex: 1, minWidth: 180, padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <select value={action} onChange={e => { setAction(e.target.value); setOffset(0); }}
          style={{ padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
          <option value="" style={{ background: "#1a1a1a" }}>All actions</option>
          {KNOWN_ACTIONS.map(a => <option key={a} value={a} style={{ background: "#1a1a1a" }}>{a}</option>)}
        </select>
        <button type="submit" style={{ padding: "9px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Filter</button>
      </form>

      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["When","Actor","Role","Action","Entity","Detail"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#666", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#555" }}>Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#555" }}>
                  {total === 0 ? "No audit log entries yet. Run migration 000011 to create the audit_logs table." : "No entries match"}
                </td></tr>
              ) : logs.map((l, i) => {
                const ac = actionColor(l.action);
                return (
                  <tr key={l.id} style={{ borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <td style={{ padding: "9px 14px", color: "#666", whiteSpace: "nowrap", fontSize: 12 }}>{fmtTime(l.created_at)}</td>
                    <td style={{ padding: "9px 14px", color: "#ccc", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.actor_email}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ fontSize: 11, color: "#888", background: "rgba(255,255,255,0.04)", padding: "2px 7px", borderRadius: 5 }}>
                        {l.actor_role.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: ac, background: `${ac}18`, padding: "3px 8px", borderRadius: 6, border: `1px solid ${ac}25` }}>
                        {l.action}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                      {l.entity_type && <span style={{ color: "#666" }}>{l.entity_type}</span>}
                      {l.entity_id  && <span style={{ color: "#555" }}> · {l.entity_id}</span>}
                    </td>
                    <td style={{ padding: "9px 14px", maxWidth: 240 }}>
                      {l.detail && (
                        <details style={{ cursor: "pointer" }}>
                          <summary style={{ fontSize: 11, color: "#555", cursor: "pointer" }}>View</summary>
                          <pre style={{ fontSize: 10, color: "#888", margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                            {JSON.stringify(l.detail, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {total > LIMIT && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center", alignItems: "center" }}>
          <button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset === 0 ? "#444" : "#888", cursor: offset === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "#666" }}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <button disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset + LIMIT >= total ? "#444" : "#888", cursor: offset + LIMIT >= total ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
