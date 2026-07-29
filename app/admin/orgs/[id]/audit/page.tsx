"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface AuditLog {
  id: number;
  action: string;
  actor_email: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function actionColor(action: string): string {
  if (action.includes("remove") || action.includes("delete") || action.includes("revoke")) return "#f87171";
  if (action.includes("add") || action.includes("create") || action.includes("invite"))   return "#4ade80";
  if (action.includes("approve") || action.includes("enable"))                              return "#34d399";
  if (action.includes("update") || action.includes("edit") || action.includes("change"))   return "#fbbf24";
  return "#60a5fa";
}

export default function OrgAuditPage() {
  const params    = useParams();
  const orgId     = params.id as string;

  const [logs,       setLogs]       = useState<AuditLog[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [hasMore,    setHasMore]    = useState(false);
  const [offset,     setOffset]     = useState(0);

  const [filters, setFilters] = useState({ action: "", actor: "" });

  const load = useCallback(async (off: number, append: boolean) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50", offset: String(off) });
    if (filters.action) params.set("action", filters.action);
    if (filters.actor)  params.set("actor",  filters.actor);

    const res = await fetch(`/api/admin/orgs/${orgId}/audit-logs?${params}`);
    if (res.ok) {
      const j = await res.json() as { logs: AuditLog[]; limit: number; offset: number };
      setLogs(prev => append ? [...prev, ...(j.logs ?? [])] : (j.logs ?? []));
      setHasMore((j.logs ?? []).length === 50);
      setOffset(off + (j.logs ?? []).length);
    }
    setLoading(false);
  }, [orgId, filters]);

  useEffect(() => {
    setOffset(0);
    setLogs([]);
    void load(0, false);
  }, [filters]); // eslint-disable-line

  useEffect(() => { void load(0, false); }, []); // eslint-disable-line

  function applyFilters(next: Partial<typeof filters>) {
    setFilters(f => ({ ...f, ...next }));
  }

  const inputStyle: React.CSSProperties = {
    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>
        <Link href="/admin/orgs" style={{ color: "#555", textDecoration: "none" }}>Orgs</Link>
        {" › "}
        <Link href={`/admin/orgs/${orgId}`} style={{ color: "#555", textDecoration: "none" }}>Detail</Link>
        {" › Audit Log"}
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Organization Audit Log</h1>
        <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Member & permission changes for this organization</p>
      </div>

      {/* Filters */}
      <div style={{
        background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
        padding: "14px 16px", marginBottom: 20,
        display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
      }}>
        <div>
          <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>ACTION SEARCH</label>
          <input type="text" placeholder="e.g. invite, remove, update…" value={filters.action}
            onChange={e => applyFilters({ action: e.target.value })}
            style={{ ...inputStyle, width: 200 }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>ACTOR EMAIL</label>
          <input type="email" placeholder="actor@example.com" value={filters.actor}
            onChange={e => applyFilters({ actor: e.target.value })}
            style={{ ...inputStyle, width: 200 }} />
        </div>
        <button onClick={() => { setFilters({ action: "", actor: "" }); }}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#666", fontSize: 12, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit" }}>
          Clear
        </button>
      </div>

      {/* Logs */}
      {!loading && logs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, color: "#555" }}>No audit entries found</div>
        </div>
      ) : (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Timestamp", "Actor", "Action", "Resource Type", "Resource ID", "IP", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const isOpen    = expandedId === log.id;
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
                          {log.resource_type ? (
                            <span style={{ fontSize: 10, padding: "2px 7px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, color: "#888" }}>
                              {log.resource_type}
                            </span>
                          ) : <span style={{ color: "#333" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#555", fontFamily: "monospace", fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {log.resource_id ?? "—"}
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
                          <td colSpan={7} style={{ padding: "0 12px 12px 12px" }}>
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

          {/* Load more / loading state */}
          <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
            {loading ? (
              <span style={{ fontSize: 12, color: "#444" }}>Loading…</span>
            ) : hasMore ? (
              <button onClick={() => void load(offset, true)}
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, padding: "7px 20px", cursor: "pointer", fontFamily: "inherit" }}>
                Load more
              </button>
            ) : (
              <span style={{ fontSize: 12, color: "#333" }}>{logs.length} {logs.length === 1 ? "entry" : "entries"} total</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
