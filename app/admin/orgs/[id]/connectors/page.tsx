"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface ConfigField {
  key: string; label: string; type: "text" | "password" | "url" | "select";
  required: boolean; placeholder?: string; options?: string[];
}

interface ConnectorConfig {
  id: string; name: string; is_active: boolean;
  last_sync_at: string | null; last_sync_status: string | null; last_sync_error: string | null;
  created_at: string; updated_at: string;
}

interface Connector {
  type: string; display_name: string; description: string;
  capabilities: { name: string; description: string }[];
  schema: ConfigField[];
  installed: boolean;
  config: ConnectorConfig | null;
}

const CONNECTOR_ICONS: Record<string, string> = {
  google_calendar: "📅", microsoft_365: "🏢", hubspot: "🟠", salesforce: "☁️",
  quickbooks: "💰", zoho_books: "📊", mailchimp: "📧", sendgrid: "📨",
  strava: "🚴", garmin: "⌚", s3: "🪣", google_drive: "💾",
};

const S: Record<string, React.CSSProperties> = {
  page:    { padding: "28px 24px", maxWidth: 1000, margin: "0 auto" },
  grid:    { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 32 },
  card:    { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "18px 18px" },
  badge:   { fontSize: "0.7rem", padding: "2px 8px", borderRadius: 99, fontWeight: 600 },
  input:   { width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: "0.83rem", fontFamily: "inherit", boxSizing: "border-box" as const },
  label:   { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4, display: "block" },
  btn:     { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" },
  btnSm:   { padding: "5px 10px", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  btnDang: { padding: "5px 10px", background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  btnGrn:  { padding: "8px 16px", background: "#059669", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:   { background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 28, width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto" as const },
  chip:    { fontSize: "0.7rem", padding: "2px 8px", background: "rgba(255,255,255,0.07)", borderRadius: 4, color: "rgba(255,255,255,0.6)" },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function SyncStatus({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return null;
  const color = status === "ok" ? "#4ade80" : status === "error" ? "#f87171" : "#fbbf24";
  return (
    <span style={{ ...S.badge, background: `${color}20`, color }}>
      {status === "ok" ? "✓ Connected" : status === "error" ? "✗ Error" : status}
    </span>
  );
}

export default function ConnectorsPage() {
  const params  = useParams<{ id: string }>();
  const orgId   = params.id;

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [orgName,    setOrgName]    = useState("");
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  // Modal state
  const [modal,       setModal]       = useState<Connector | null>(null);
  const [modalMode,   setModalMode]   = useState<"install" | "edit" | "view">("install");
  const [connName,    setConnName]    = useState("");
  const [connConfig,  setConnConfig]  = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState(false);
  const [saveErr,     setSaveErr]     = useState("");
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState<{ success: boolean; latency_ms: number; error: string | null } | null>(null);
  const [removing,    setRemoving]    = useState<string | null>(null);
  const [toggling,    setToggling]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [cRes, oRes] = await Promise.all([
        fetch(`/api/admin/connectors?org_id=${orgId}`),
        fetch(`/api/admin/orgs/${orgId}`),
      ]);
      const cData = await cRes.json();
      const oData = await oRes.json();
      if (!cRes.ok) { setError(cData.error ?? "Failed to load connectors"); return; }
      setConnectors(cData.data ?? []);
      setOrgName(oData.org?.name ?? "");
    } catch { setError("Network error"); }
    finally  { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function openInstall(c: Connector) {
    setModal(c); setModalMode("install"); setConnName(c.display_name); setConnConfig({});
    setSaveErr(""); setTestResult(null);
  }

  function openEdit(c: Connector) {
    setModal(c); setModalMode("edit"); setConnName(c.config?.name ?? c.display_name); setConnConfig({});
    setSaveErr(""); setTestResult(null);
  }

  async function save() {
    if (!modal) return;
    setSaving(true); setSaveErr("");
    try {
      const isInstall = modalMode === "install";
      const url    = isInstall ? "/api/admin/connectors" : `/api/admin/connectors/${modal.type}`;
      const method = isInstall ? "POST" : "PUT";
      const body   = isInstall
        ? { org_id: orgId, connector_type: modal.type, name: connName, config: connConfig }
        : { org_id: orgId, name: connName, config: Object.keys(connConfig).length > 0 ? connConfig : undefined };

      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setSaveErr(d.error ?? "Failed to save"); return; }
      setModal(null);
      load();
    } catch { setSaveErr("Network error"); }
    finally  { setSaving(false); }
  }

  async function testConn(type: string) {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`/api/admin/connectors/${type}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, config: Object.keys(connConfig).length > 0 ? connConfig : undefined }),
      });
      const d = await r.json();
      setTestResult(d.data ?? { success: false, latency_ms: 0, error: d.error ?? "Failed" });
    } catch { setTestResult({ success: false, latency_ms: 0, error: "Network error" }); }
    finally  { setTesting(false); }
  }

  async function remove(type: string) {
    if (!confirm(`Remove the ${type} connector? This cannot be undone.`)) return;
    setRemoving(type);
    try {
      await fetch(`/api/admin/connectors/${type}?org_id=${orgId}`, { method: "DELETE" });
      load();
    } finally { setRemoving(null); }
  }

  async function toggleActive(c: Connector) {
    setToggling(c.type);
    try {
      await fetch(`/api/admin/connectors/${c.type}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, is_active: !c.config?.is_active }),
      });
      load();
    } finally { setToggling(null); }
  }

  const installed  = connectors.filter(c => c.installed);
  const available  = connectors.filter(c => !c.installed);

  return (
    <div style={S.page}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
        <Link href="/admin/orgs" style={{ color: "#555", textDecoration: "none" }}>Organizations</Link>
        {" / "}
        <Link href={`/admin/orgs/${orgId}`} style={{ color: "#555", textDecoration: "none" }}>{orgName || orgId}</Link>
        {" / Connectors"}
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>🔌 Connectors</h1>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(255,255,255,0.45)" }}>
          Integrate Connected Steps with third-party services. Configuration is stored encrypted per-organization.
        </p>
      </div>

      {error && <div style={{ color: "#f87171", marginBottom: 16, fontSize: "0.85rem" }}>{error}</div>}

      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading connectors…</div>
      ) : (
        <>
          {/* Installed */}
          {installed.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
                Installed ({installed.length})
              </div>
              <div style={S.grid}>
                {installed.map(c => (
                  <div key={c.type} style={{ ...S.card, borderColor: c.config?.is_active ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.09)", opacity: c.config?.is_active ? 1 : 0.7 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>{CONNECTOR_ICONS[c.type] ?? "🔌"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>{c.display_name}</div>
                        <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{c.config?.name}</div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <SyncStatus status={c.config?.last_sync_status ?? null} error={c.config?.last_sync_error ?? null} />
                      </div>
                    </div>

                    {c.capabilities.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                        {c.capabilities.slice(0, 3).map(cap => (
                          <span key={cap.name} style={S.chip}>{cap.name}</span>
                        ))}
                        {c.capabilities.length > 3 && <span style={S.chip}>+{c.capabilities.length - 3}</span>}
                      </div>
                    )}

                    {c.config?.last_sync_at && (
                      <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
                        Last synced {fmtDate(c.config.last_sync_at)}
                      </div>
                    )}
                    {c.config?.last_sync_error && (
                      <div style={{ fontSize: "0.72rem", color: "#f87171", fontFamily: "monospace", marginBottom: 10 }}>
                        {c.config.last_sync_error.slice(0, 100)}{c.config.last_sync_error.length > 100 ? "…" : ""}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={S.btnSm} onClick={() => testConn(c.type)} disabled={testing}>Test</button>
                      <button style={S.btnSm} onClick={() => openEdit(c)}>Edit Config</button>
                      <button style={S.btnSm} onClick={() => toggleActive(c)} disabled={toggling === c.type}>
                        {c.config?.is_active ? "Disable" : "Enable"}
                      </button>
                      <button style={{ ...S.btnDang, marginLeft: "auto" }} onClick={() => remove(c.type)} disabled={removing === c.type}>
                        {removing === c.type ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available */}
          {available.length > 0 && (
            <div>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
                Available ({available.length})
              </div>
              <div style={S.grid}>
                {available.map(c => (
                  <div key={c.type} style={{ ...S.card, opacity: 0.75 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>{CONNECTOR_ICONS[c.type] ?? "🔌"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>{c.display_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.4 }}>{c.description}</div>
                      </div>
                    </div>
                    {c.capabilities.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                        {c.capabilities.slice(0, 3).map(cap => (
                          <span key={cap.name} style={S.chip}>{cap.name}</span>
                        ))}
                        {c.capabilities.length > 3 && <span style={S.chip}>+{c.capabilities.length - 3}</span>}
                      </div>
                    )}
                    <button style={{ ...S.btn, fontSize: "0.8rem", padding: "6px 14px" }} onClick={() => openInstall(c)}>
                      + Install
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {connectors.length === 0 && !error && (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem", textAlign: "center", padding: "40px 0" }}>
              No connectors found.
            </div>
          )}
        </>
      )}

      {/* Install / Edit modal */}
      {modal && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: "1.6rem" }}>{CONNECTOR_ICONS[modal.type] ?? "🔌"}</span>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "1rem" }}>
                  {modalMode === "install" ? `Install ${modal.display_name}` : `Edit ${modal.display_name}`}
                </div>
                <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>{modal.description}</div>
              </div>
            </div>

            {/* Connector name */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Display Name *</label>
              <input style={S.input} value={connName} onChange={e => setConnName(e.target.value)} placeholder={modal.display_name} />
            </div>

            {/* Dynamic config fields */}
            {modal.schema.map(field => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={S.label}>
                  {field.label} {field.required ? "*" : <span style={{ color: "#555" }}>(optional)</span>}
                </label>
                {field.type === "select" ? (
                  <select style={{ ...S.input, appearance: "none" as React.CSSProperties["appearance"] }}
                    value={connConfig[field.key] ?? ""}
                    onChange={e => setConnConfig(p => ({ ...p, [field.key]: e.target.value }))}>
                    <option value="">Select…</option>
                    {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    style={S.input}
                    type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                    value={connConfig[field.key] ?? ""}
                    onChange={e => setConnConfig(p => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder ?? ""}
                  />
                )}
              </div>
            ))}

            {/* Test result */}
            {testResult && (
              <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8,
                background: testResult.success ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${testResult.success ? "rgba(74,222,128,0.25)" : "rgba(239,68,68,0.25)"}`,
                fontSize: "0.82rem", color: testResult.success ? "#4ade80" : "#f87171" }}>
                {testResult.success
                  ? `✓ Connected successfully (${testResult.latency_ms}ms)`
                  : `✗ ${testResult.error ?? "Connection failed"}`}
              </div>
            )}

            {saveErr && <div style={{ color: "#f87171", fontSize: "0.82rem", marginBottom: 12 }}>{saveErr}</div>}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button style={S.btn} onClick={save} disabled={saving || !connName}>
                {saving ? "Saving…" : modalMode === "install" ? "Install" : "Save Changes"}
              </button>
              {modal.installed && (
                <button style={S.btnSm} onClick={() => testConn(modal.type)} disabled={testing}>
                  {testing ? "Testing…" : "Test Connection"}
                </button>
              )}
              <button style={S.btnSm} onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
