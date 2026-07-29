"use client";

import { useState, useEffect } from "react";

interface Automation {
  id: string; name: string; description: string | null;
  trigger_event: string; conditions: unknown[]; actions: unknown[];
  is_active: boolean; created_by: string; created_at: string;
}

interface RunLogEntry {
  id: string; trigger_event: string; status: string;
  actions_taken: unknown[]; error: string | null;
  duration_ms: number | null; created_at: string;
}

const TRIGGERS = [
  "payment.succeeded","payment.failed","registration.created","registration.cancelled",
  "participant.checked_in","certificate.generated","refund.completed","membership.renewed",
  "waitlist.promoted","registration_capacity.90_percent","merchandise_stock.low",
];

const ACTION_TYPES = ["send_webhook","notify_org","generate_certificate"];

const S: Record<string, React.CSSProperties> = {
  page:    { padding: "28px 24px", maxWidth: 900, margin: "0 auto" },
  header:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  title:   { fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: 0 },
  btn:     { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" },
  btnSm:   { padding: "5px 10px", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  btnDang: { padding: "5px 10px", background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  card:    { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "16px 18px", marginBottom: 10 },
  input:   { width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: "0.83rem", fontFamily: "inherit", boxSizing: "border-box" as const },
  select:  { padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: "0.83rem", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const },
  label:   { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" },
  row:     { display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" },
  chip:    { fontSize: "0.7rem", padding: "1px 7px", background: "rgba(255,255,255,0.07)", borderRadius: 4, color: "rgba(255,255,255,0.6)" },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:   { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 28, width: 540, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto" as const },
};

function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

export default function AutomationsPage() {
  const [rules,      setRules]      = useState<Automation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [form,       setForm]       = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [logMap,     setLogMap]     = useState<Record<string, RunLogEntry[] | null>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [name,    setName]    = useState("");
  const [desc,    setDesc]    = useState("");
  const [trigger, setTrigger] = useState(TRIGGERS[0]);
  const [action,  setAction]  = useState(ACTION_TYPES[0]);
  const [whUrl,   setWhUrl]   = useState(""); // for send_webhook

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/automations");
      const d = await r.json();
      setRules(d.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    const actions: unknown[] = [];
    if (action === "send_webhook") actions.push({ type: "send_webhook", params: { url: whUrl } });
    else actions.push({ type: action, params: {} });

    try {
      const r = await fetch("/api/admin/automations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, description: desc || undefined, trigger_event: trigger, conditions: [], actions }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      setForm(false); setName(""); setDesc(""); setTrigger(TRIGGERS[0]); setAction(ACTION_TYPES[0]); setWhUrl("");
      load();
    } catch { setError("Network error"); }
    finally  { setSaving(false); }
  }

  async function toggle(r: Automation) {
    await fetch(`/api/admin/automations/${r.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_active: !r.is_active }),
    });
    load();
  }

  async function del(id: string) {
    if (!confirm("Delete this automation?")) return;
    await fetch(`/api/admin/automations/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleRunLog(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (logMap[id] !== undefined) return;
    setLogMap(prev => ({ ...prev, [id]: null }));
    try {
      const r = await fetch(`/api/admin/automations/${id}/run-log?per_page=25`);
      const d = await r.json();
      setLogMap(prev => ({ ...prev, [id]: d.data ?? [] }));
    } catch {
      setLogMap(prev => ({ ...prev, [id]: [] }));
    }
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>⚡ Automations</h1>
        <button style={S.btn} onClick={() => setForm(true)}>+ New Rule</button>
      </div>

      {error && <div style={{ color: "#f87171", marginBottom: 12, fontSize: "0.85rem" }}>{error}</div>}

      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading…</div>
      ) : rules.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem", textAlign: "center", padding: "40px 0" }}>No automation rules yet.</div>
      ) : rules.map(r => {
        const isExpanded = expandedId === r.id;
        const log        = logMap[r.id];
        return (
        <div key={r.id} style={{ ...S.card, opacity: r.is_active ? 1 : 0.55 }}>
          <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "#fff" }}>{r.name}</span>
            <div style={S.row}>
              <button style={{ ...S.btnSm, color: isExpanded ? "#a5b4fc" : undefined }} onClick={() => toggleRunLog(r.id)}>
                {isExpanded ? "▲ Log" : "▼ Log"}
              </button>
              <button style={S.btnSm} onClick={() => toggle(r)}>{r.is_active ? "Disable" : "Enable"}</button>
              <button style={S.btnDang} onClick={() => del(r.id)}>Delete</button>
            </div>
          </div>
          {r.description && <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{r.description}</div>}
          <div style={{ ...S.row, marginBottom: 4 }}>
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Trigger:</span>
            <span style={S.chip}>{r.trigger_event}</span>
          </div>
          <div style={S.row}>
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Actions:</span>
            {(r.actions as Array<{ type: string }>).map((a, i) => <span key={i} style={S.chip}>{a.type}</span>)}
          </div>
          <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.3)", marginTop: 8 }}>Created {fmtDate(r.created_at)} by {r.created_by}</div>

          {/* Run log panel */}
          {isExpanded && (
            <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
              <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Run Log (last 25)</div>
              {log === null && <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)" }}>Loading…</div>}
              {log !== null && log.length === 0 && <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>No runs yet.</div>}
              {log !== null && log.length > 0 && log.map(entry => (
                <div key={entry.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", gap: 10, fontSize: "0.78rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: entry.status === "success" ? "#4ade80" : entry.status === "failed" ? "#f87171" : "#fbbf24" }}>{entry.status}</span>
                    <span style={{ color: "rgba(255,255,255,0.35)" }}>{fmtDate(entry.created_at)}</span>
                    {entry.duration_ms != null && <span style={{ color: "#555", fontSize: "0.72rem" }}>{entry.duration_ms}ms</span>}
                  </div>
                  {entry.error && <div style={{ fontSize: "0.72rem", color: "#f87171", fontFamily: "monospace", marginTop: 2 }}>{entry.error.slice(0, 120)}{entry.error.length > 120 ? "…" : ""}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })}

      {form && (
        <div style={S.overlay} onClick={() => setForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 20 }}>New Automation Rule</div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Name *</label>
              <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Notify team on payment" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Description</label>
              <input style={S.input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Trigger Event *</label>
              <select style={S.select} value={trigger} onChange={e => setTrigger(e.target.value)}>
                {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: action === "send_webhook" ? 12 : 20 }}>
              <label style={S.label}>Action *</label>
              <select style={S.select} value={action} onChange={e => setAction(e.target.value)}>
                {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {action === "send_webhook" && (
              <div style={{ marginBottom: 20 }}>
                <label style={S.label}>Webhook URL</label>
                <input style={S.input} value={whUrl} onChange={e => setWhUrl(e.target.value)} placeholder="https://hooks.example.com/..." />
              </div>
            )}
            <div style={S.row}>
              <button style={S.btn} onClick={create} disabled={saving || !name}>{saving ? "Saving…" : "Create"}</button>
              <button style={S.btnSm} onClick={() => setForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
