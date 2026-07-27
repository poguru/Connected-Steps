"use client";

import { useState, useEffect } from "react";

interface Webhook {
  id: string; name: string; url: string; events: string[]; is_active: boolean;
  description: string | null; max_attempts: number; timeout_seconds: number;
  created_by: string; created_at: string;
}

interface Delivery {
  id: string; event_type: string; status: string; http_status: number | null;
  attempt_count: number; error_message: string | null; created_at: string;
}

const S: Record<string, React.CSSProperties> = {
  page:    { padding: "28px 24px", maxWidth: 900, margin: "0 auto" },
  header:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  title:   { fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: 0 },
  btn:     { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" },
  btnSm:   { padding: "5px 10px", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  btnDang: { padding: "5px 10px", background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  card:    { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "16px 18px", marginBottom: 10 },
  input:   { width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: "0.83rem", fontFamily: "inherit", boxSizing: "border-box" as const },
  label:   { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" },
  chip:    { fontSize: "0.7rem", padding: "1px 7px", background: "rgba(255,255,255,0.07)", borderRadius: 4, color: "rgba(255,255,255,0.6)" },
  row:     { display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:   { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 28, width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto" as const },
  warning: { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 7, padding: "10px 14px", fontSize: "0.82rem", color: "#fbbf24", marginTop: 12 },
  rawkey:  { fontFamily: "monospace", wordBreak: "break-all" as const, fontSize: "0.82rem", padding: "10px 12px", background: "rgba(0,0,0,0.4)", borderRadius: 6, color: "#34d399", marginTop: 8 },
};

const ALL_EVENTS = [
  "payment.succeeded","payment.failed","registration.created","registration.cancelled",
  "participant.checked_in","certificate.generated","refund.completed","membership.renewed",
  "waitlist.promoted",
];

function fmtDate(d: string) { return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function WebhooksPage() {
  const [hooks,       setHooks]       = useState<Webhook[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [formOpen,    setFormOpen]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [secretReveal, setSecretReveal] = useState<string | null>(null);
  const [deliveries,  setDeliveries]  = useState<{ hookId: string; rows: Delivery[] } | null>(null);
  const [testing,     setTesting]     = useState<string | null>(null);
  const [testResult,  setTestResult]  = useState<{ success: boolean; http_status: number | null; error: string | null } | null>(null);

  // Form
  const [name,    setName]    = useState("");
  const [url,     setUrl]     = useState("");
  const [events,  setEvents]  = useState<string[]>(["registration.created"]);
  const [desc,    setDesc]    = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/webhooks");
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      setHooks(d.data ?? []);
    } catch { setError("Network error"); }
    finally  { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/webhooks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, url, events, description: desc || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      setSecretReveal(d.data.signing_secret);
      setFormOpen(false); setName(""); setUrl(""); setEvents(["registration.created"]); setDesc("");
      load();
    } catch { setError("Network error"); }
    finally  { setSaving(false); }
  }

  async function deleteHook(id: string) {
    if (!confirm("Delete this webhook? Cannot be undone.")) return;
    await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(h: Webhook) {
    await fetch(`/api/admin/webhooks/${h.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_active: !h.is_active }),
    });
    load();
  }

  async function loadDeliveries(id: string) {
    const r = await fetch(`/api/admin/webhooks/${id}/deliveries?per_page=20`);
    const d = await r.json();
    setDeliveries({ hookId: id, rows: d.data ?? [] });
  }

  async function testHook(id: string) {
    setTesting(id); setTestResult(null);
    const r = await fetch(`/api/admin/webhooks/${id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await r.json();
    setTestResult(d.data ?? { success: false, http_status: null, error: d.error ?? "Failed" });
    setTesting(null);
  }

  function toggleEvent(e: string) {
    setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>📡 Webhooks</h1>
        <button style={S.btn} onClick={() => setFormOpen(true)}>+ New Webhook</button>
      </div>

      {error && <div style={{ color: "#f87171", marginBottom: 12, fontSize: "0.85rem" }}>{error}</div>}
      {testResult && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: testResult.success ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${testResult.success ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`, fontSize: "0.83rem", color: testResult.success ? "#34d399" : "#f87171" }}>
          Test result: {testResult.success ? `✅ HTTP ${testResult.http_status}` : `❌ ${testResult.error ?? `HTTP ${testResult.http_status}`}`}
          <button style={{ ...S.btnSm, marginLeft: 12 }} onClick={() => setTestResult(null)}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading…</div>
      ) : hooks.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", textAlign: "center", padding: "40px 0" }}>No webhooks yet.</div>
      ) : hooks.map(h => (
        <div key={h.id} style={{ ...S.card, opacity: h.is_active ? 1 : 0.6 }}>
          <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "#fff" }}>{h.name}</span>
            <div style={S.row}>
              <button style={S.btnSm} onClick={() => toggleActive(h)}>{h.is_active ? "Disable" : "Enable"}</button>
              <button style={S.btnSm} onClick={() => testHook(h.id)} disabled={testing === h.id}>{testing === h.id ? "Testing…" : "Test"}</button>
              <button style={S.btnSm} onClick={() => loadDeliveries(h.id)}>Deliveries</button>
              <button style={S.btnDang} onClick={() => deleteHook(h.id)}>Delete</button>
            </div>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#a5b4fc", fontFamily: "monospace", marginBottom: 6 }}>{h.url}</div>
          <div style={S.row}>
            {h.events.map(e => <span key={e} style={S.chip}>{e}</span>)}
          </div>
          <div style={{ fontSize: "0.74rem", color: "rgba(255,255,255,0.35)", marginTop: 8 }}>Created {fmtDate(h.created_at)} by {h.created_by}</div>

          {/* Delivery log inline */}
          {deliveries?.hookId === h.id && (
            <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>Recent Deliveries</div>
              {deliveries.rows.length === 0 ? (
                <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)" }}>No deliveries yet.</div>
              ) : deliveries.rows.map(d => (
                <div key={d.id} style={{ display: "flex", gap: 10, fontSize: "0.78rem", marginBottom: 4, alignItems: "center" }}>
                  <span style={{ color: d.status === "success" ? "#34d399" : d.status === "failed" ? "#f87171" : d.status === "pending" ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>{d.status}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{d.event_type}</span>
                  {d.http_status && <span style={{ color: "rgba(255,255,255,0.4)" }}>HTTP {d.http_status}</span>}
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>{fmtDate(d.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {formOpen && (
        <div style={S.overlay} onClick={() => setFormOpen(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "1.05rem", marginBottom: 20 }}>New Webhook</div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Name *</label>
              <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Zapier registration hook" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Endpoint URL *</label>
              <input style={S.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://hooks.example.com/cs" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Description</label>
              <input style={S.input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>Events *</label>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 4 }}>
                {ALL_EVENTS.map(ev => (
                  <label key={ev} style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: events.includes(ev) ? "#a5b4fc" : "rgba(255,255,255,0.5)" }}>
                    <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} /> {ev}
                  </label>
                ))}
              </div>
            </div>
            <div style={S.row}>
              <button style={S.btn} onClick={create} disabled={saving || !name || !url || !events.length}>{saving ? "Creating…" : "Create"}</button>
              <button style={S.btnSm} onClick={() => setFormOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {secretReveal && (
        <div style={S.overlay} onClick={() => setSecretReveal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12 }}>📡 Webhook Signing Secret</div>
            <div style={S.warning}>Copy this secret now — it will not be shown again. Use it to verify <code>X-CS-Signature</code> headers on incoming deliveries.</div>
            <div style={S.rawkey}>{secretReveal}</div>
            <div style={{ marginTop: 20 }}>
              <button style={S.btn} onClick={() => navigator.clipboard.writeText(secretReveal)}>Copy</button>
              {" "}
              <button style={S.btnSm} onClick={() => setSecretReveal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
