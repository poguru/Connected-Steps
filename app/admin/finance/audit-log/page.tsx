"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditLog {
  id: number;
  organization_id: string;
  event_id: string | null;
  action: string;
  actor_email: string;
  entity_type: string;
  entity_id: string | null;
  amount_paise: number | null;
  amount_rupees: number | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

const ENTITY_TYPES = ["", "registration", "membership", "merchandise", "donation", "sponsorship", "manual_payment", "payout", "refund", "invoice", "other"];

function fmt(paise: number | null): string {
  if (paise == null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function actionColor(action: string): string {
  if (action.includes("refund") || action.includes("cancel"))   return "#f87171";
  if (action.includes("create") || action.includes("record"))   return "#4ade80";
  if (action.includes("verify") || action.includes("approve"))  return "#34d399";
  if (action.includes("payout"))                                 return "#a78bfa";
  if (action.includes("update") || action.includes("edit"))      return "#fbbf24";
  return "#60a5fa";
}

export default function FinanceAuditLogPage() {
  const [logs,       setLogs]       = useState<AuditLog[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [filters, setFilters] = useState({
    entity_type: "",
    action:      "",
    date_from:   "",
    date_to:     "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filters.entity_type) params.set("entity_type", filters.entity_type);
    if (filters.action)      params.set("action",      filters.action);
    if (filters.date_from)   params.set("date_from",   filters.date_from);
    if (filters.date_to)     params.set("date_to",     filters.date_to);

    const res = await fetch(`/api/admin/finance/audit?${params}`);
    if (res.ok) {
      const j = await res.json();
      setLogs(j.logs ?? []);
      setTotal(j.total ?? 0);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { void load(); }, [load]);

  function applyFilters(next: Partial<typeof filters>) {
    setFilters(f => ({ ...f, ...next }));
    setPage(1);
  }

  const inputStyle: React.CSSProperties = {
    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Financial Audit Log</h1>
        <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>
          Immutable trail of every financial action — {total.toLocaleString()} entries
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
        padding: "14px 16px", marginBottom: 20,
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, alignItems: "end",
      }}>
        <div>
          <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>ENTITY TYPE</label>
          <select value={filters.entity_type} onChange={e => applyFilters({ entity_type: e.target.value })} style={{ ...inputStyle, width: "100%" }}>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t || "All types"}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>ACTION SEARCH</label>
          <input type="text" placeholder="e.g. refund, create…" value={filters.action}
            onChange={e => applyFilters({ action: e.target.value })}
            style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>FROM DATE</label>
          <input type="date" value={filters.date_from}
            onChange={e => applyFilters({ date_from: e.target.value })}
            style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>TO DATE</label>
          <input type="date" value={filters.date_to}
            onChange={e => applyFilters({ date_to: e.target.value })}
            style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <button onClick={() => { setFilters({ entity_type: "", action: "", date_from: "", date_to: "" }); setPage(1); }}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#666", fontSize: 12, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, color: "#555" }}>No audit records match these filters</div>
        </div>
      ) : (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Timestamp", "Actor", "Action", "Entity Type", "Entity ID", "Amount", "IP", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const isOpen = expandedId === log.id;
                  const hasDetail = log.detail && Object.keys(log.detail).length > 0;
                  return (
                    <>
                      <tr key={log.id}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isOpen ? "rgba(232,98,10,0.04)" : "transparent" }}>
                        <td style={{ padding: "10px 12px", color: "#666", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {fmtTs(log.created_at)}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#aaa", fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {log.actor_email}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: actionColor(log.action), background: `${actionColor(log.action)}15`, border: `1px solid ${actionColor(log.action)}30`, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
                            {log.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 10, padding: "2px 7px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, color: "#888" }}>
                            {log.entity_type}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#555", fontFamily: "monospace", fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {log.entity_id ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: log.amount_paise ? "#e8620a" : "#555", fontWeight: log.amount_paise ? 600 : 400, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(log.amount_paise)}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#444", fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap" }}>
                          {log.ip ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {hasDetail && (
                            <button onClick={() => setExpandedId(isOpen ? null : log.id)}
                              style={{ padding: "3px 10px", background: isOpen ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${isOpen ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 5, color: isOpen ? "#e8620a" : "#555", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                              {isOpen ? "▲ Hide" : "▼ Detail"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && hasDetail && (
                        <tr key={`${log.id}-detail`} style={{ background: "rgba(232,98,10,0.03)" }}>
                          <td colSpan={8} style={{ padding: "0 12px 12px 12px" }}>
                            <pre style={{ fontSize: 11, color: "#888", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "10px 12px", margin: 0, overflowX: "auto", lineHeight: 1.5, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                              {JSON.stringify(log.detail, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 50 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: page === 1 ? "#333" : "#888", fontSize: 12, padding: "6px 14px", cursor: page === 1 ? "default" : "pointer", fontFamily: "inherit" }}>
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: "#555" }}>
                Page {page} · {total.toLocaleString()} total
              </span>
              <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 50}
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: logs.length < 50 ? "#333" : "#888", fontSize: 12, padding: "6px 14px", cursor: logs.length < 50 ? "default" : "pointer", fontFamily: "inherit" }}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
