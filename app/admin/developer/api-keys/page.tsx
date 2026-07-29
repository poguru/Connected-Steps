"use client";

import { useState, useEffect } from "react";

interface ApiKey {
  id: string; name: string; description: string | null; key_preview: string;
  key_type: string; scopes: string[]; is_active: boolean;
  expires_at: string | null; last_used_at: string | null;
  created_by: string; created_at: string;
}

interface KeyUsageData {
  monthly_stats: { month_bucket: string; request_count: number; avg_latency_ms: number; error_count: number }[];
  recent: { endpoint: string; method: string; status_code: number; latency_ms: number; created_at: string }[];
}

const S: Record<string, React.CSSProperties> = {
  page:    { padding: "28px 24px", maxWidth: 900, margin: "0 auto" },
  header:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  title:   { fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: 0 },
  btn:     { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" },
  btnSm:   { padding: "5px 10px", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  btnDang: { padding: "5px 10px", background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  card:    { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "16px 18px", marginBottom: 10 },
  mono:    { fontFamily: "monospace", fontSize: "0.85rem", color: "#a5b4fc", background: "rgba(99,102,241,0.1)", padding: "2px 8px", borderRadius: 4 },
  label:   { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 },
  row:     { display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" },
  chip:    { fontSize: "0.7rem", padding: "1px 7px", background: "rgba(255,255,255,0.07)", borderRadius: 4, color: "rgba(255,255,255,0.6)" },
  input:   { width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: "0.83rem", fontFamily: "inherit", boxSizing: "border-box" as const },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:   { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 28, width: 480, maxWidth: "calc(100vw - 32px)" },
  warning: { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 7, padding: "10px 14px", fontSize: "0.82rem", color: "#fbbf24", marginTop: 12 },
  rawkey:  { fontFamily: "monospace", wordBreak: "break-all" as const, fontSize: "0.82rem", padding: "10px 12px", background: "rgba(0,0,0,0.4)", borderRadius: 6, color: "#34d399", marginTop: 8 },
};

const ALL_SCOPES = [
  "events:read","events:write","registrations:read","registrations:write",
  "participants:read","participants:write","memberships:read","merchandise:read",
  "merchandise:write","finance:read","communications:read","communications:write",
  "webhooks:read","webhooks:write","import:write","*",
];

function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

export default function ApiKeysPage() {
  const [keys,       setKeys]       = useState<ApiKey[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [creating,   setCreating]   = useState(false);
  const [newKey,     setNewKey]     = useState<{ raw_key: string } | null>(null);
  const [usageMap,   setUsageMap]   = useState<Record<string, KeyUsageData | null>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [name,       setName]       = useState("");
  const [desc,       setDesc]       = useState("");
  const [keyType,    setKeyType]    = useState<"live" | "test">("live");
  const [scopes,     setScopes]     = useState<string[]>(["events:read"]);
  const [expiresAt,  setExpiresAt]  = useState("");
  const [formOpen,   setFormOpen]   = useState(false);
  const [saving,     setSaving]     = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/api-keys");
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      setKeys(d.data ?? []);
    } catch { setError("Network error"); }
    finally  { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createKey() {
    if (!name.trim() || !scopes.length) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/api-keys", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, description: desc, key_type: keyType, scopes, expires_at: expiresAt || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      setNewKey({ raw_key: d.data.raw_key });
      setFormOpen(false); setName(""); setDesc(""); setScopes(["events:read"]); setExpiresAt("");
      load();
    } catch { setError("Network error"); }
    finally  { setSaving(false); }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this key? It will stop working immediately.")) return;
    await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  async function rotateKey(id: string) {
    if (!confirm("Rotate this key? The old key will be revoked.")) return;
    const r  = await fetch(`/api/admin/api-keys/${id}/rotate`, { method: "POST" });
    const d  = await r.json();
    if (r.ok) { setNewKey({ raw_key: d.data.raw_key }); load(); }
  }

  async function toggleUsage(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (usageMap[id] !== undefined) return; // already loaded
    setUsageMap(prev => ({ ...prev, [id]: null })); // null = loading
    try {
      const r = await fetch(`/api/admin/api-keys/${id}/usage`);
      const d = await r.json();
      setUsageMap(prev => ({ ...prev, [id]: d.data ?? null }));
    } catch {
      setUsageMap(prev => ({ ...prev, [id]: null }));
    }
  }

  function toggleScope(s: string) {
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>🔑 API Keys</h1>
        <button style={S.btn} onClick={() => setFormOpen(true)}>+ New Key</button>
      </div>

      {error && <div style={{ color: "#f87171", marginBottom: 12, fontSize: "0.85rem" }}>{error}</div>}

      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading…</div>
      ) : keys.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", textAlign: "center", padding: "40px 0" }}>No API keys yet. Create one to get started.</div>
      ) : keys.map(k => {
        const isExpanded = expandedId === k.id;
        const usage      = usageMap[k.id];
        return (
        <div key={k.id} style={{ ...S.card, opacity: k.is_active ? 1 : 0.5 }}>
          <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.95rem" }}>{k.name}</span>
            <div style={S.row}>
              <button style={{ ...S.btnSm, color: isExpanded ? "#a5b4fc" : undefined, borderColor: isExpanded ? "rgba(99,102,241,0.4)" : undefined }} onClick={() => toggleUsage(k.id)}>
                {isExpanded ? "▲ Usage" : "▼ Usage"}
              </button>
              {k.is_active && <button style={S.btnSm} onClick={() => rotateKey(k.id)}>Rotate</button>}
              {k.is_active && <button style={S.btnDang} onClick={() => revokeKey(k.id)}>Revoke</button>}
              {!k.is_active && <span style={{ fontSize: "0.75rem", color: "#f87171" }}>Revoked</span>}
            </div>
          </div>
          <div style={{ ...S.row, marginBottom: 8 }}>
            <span style={S.mono}>{k.key_preview}</span>
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>{k.key_type}</span>
          </div>
          <div style={{ ...S.row, marginBottom: 6 }}>
            {k.scopes.map(s => <span key={s} style={S.chip}>{s}</span>)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>
            Created {fmtDate(k.created_at)} by {k.created_by}
            {k.expires_at && ` · Expires ${fmtDate(k.expires_at)}`}
            {k.last_used_at && ` · Last used ${fmtDate(k.last_used_at)}`}
          </div>

          {/* Usage panel */}
          {isExpanded && (
            <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
              {usage === null && <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)" }}>Loading…</div>}
              {usage && (
                <>
                  {usage.monthly_stats.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>No usage recorded yet.</div>
                  ) : (
                    <>
                      <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Monthly Usage (last 12 months)</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                          <thead>
                            <tr>
                              {["Month", "Requests", "Avg Latency", "Errors"].map(h => (
                                <th key={h} style={{ padding: "5px 10px", textAlign: "left", fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {usage.monthly_stats.map(m => (
                              <tr key={m.month_bucket} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.6)" }}>{m.month_bucket}</td>
                                <td style={{ padding: "5px 10px", color: "#fff", fontWeight: 600 }}>{m.request_count.toLocaleString()}</td>
                                <td style={{ padding: "5px 10px", color: "rgba(255,255,255,0.5)" }}>{m.avg_latency_ms}ms</td>
                                <td style={{ padding: "5px 10px", color: m.error_count > 0 ? "#f87171" : "#444" }}>{m.error_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {usage.recent.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Recent Requests (last 50)</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                          <thead>
                            <tr>
                              {["Method", "Endpoint", "Status", "Latency"].map(h => (
                                <th key={h} style={{ padding: "4px 10px", textAlign: "left", fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {usage.recent.map((r, i) => (
                              <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "4px 10px", fontFamily: "monospace", color: "#a5b4fc", fontSize: "0.73rem" }}>{r.method}</td>
                                <td style={{ padding: "4px 10px", fontFamily: "monospace", color: "rgba(255,255,255,0.6)", fontSize: "0.73rem" }}>{r.endpoint}</td>
                                <td style={{ padding: "4px 10px", color: r.status_code < 400 ? "#4ade80" : "#f87171" }}>{r.status_code}</td>
                                <td style={{ padding: "4px 10px", color: "rgba(255,255,255,0.4)" }}>{r.latency_ms}ms</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        );
      })}

      {/* Create form modal */}
      {formOpen && (
        <div style={S.overlay} onClick={() => setFormOpen(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "1.05rem", marginBottom: 20 }}>New API Key</div>
            <div style={{ marginBottom: 12 }}>
              <div style={S.label}>Name *</div>
              <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Zapier integration" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={S.label}>Description</div>
              <input style={S.input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={S.label}>Key Type</div>
              <div style={S.row}>
                {(["live", "test"] as const).map(t => (
                  <label key={t} style={{ fontSize: "0.83rem", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="radio" value={t} checked={keyType === t} onChange={() => setKeyType(t)} /> {t}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={S.label}>Scopes *</div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 4 }}>
                {ALL_SCOPES.map(s => (
                  <label key={s} style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: scopes.includes(s) ? "#a5b4fc" : "rgba(255,255,255,0.5)" }}>
                    <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} /> {s}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={S.label}>Expires At (optional)</div>
              <input type="date" style={S.input} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
            <div style={S.row}>
              <button style={S.btn} onClick={createKey} disabled={saving}>{saving ? "Creating…" : "Create Key"}</button>
              <button style={S.btnSm} onClick={() => setFormOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New key reveal modal */}
      {newKey && (
        <div style={S.overlay} onClick={() => setNewKey(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "1.05rem", marginBottom: 12 }}>🔑 Your New API Key</div>
            <div style={S.warning}>Copy this key now. It will not be shown again.</div>
            <div style={S.rawkey}>{newKey.raw_key}</div>
            <div style={{ marginTop: 20 }}>
              <button style={S.btn} onClick={() => { navigator.clipboard.writeText(newKey.raw_key); }}>Copy to Clipboard</button>
              {" "}
              <button style={S.btnSm} onClick={() => setNewKey(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
