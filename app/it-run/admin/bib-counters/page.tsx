"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";
const GREEN = "#10b981";
const MUTED = "#888";

type Counter = { id: string; label: string; is_enabled: boolean; sort_order: number };

const INPUT: React.CSSProperties = {
  padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none", minWidth: 0,
};

export default function BibCountersPage() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/it-run/admin/bib-counters");
      const d = await res.json().catch(() => ({})) as { counters?: Counter[]; error?: string };
      if (!res.ok) setMessage({ text: d.error ?? "Could not load counters", ok: false });
      else setCounters(d.counters ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(method: "POST" | "PATCH", body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/it-run/admin/bib-counters", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setMessage({ text: d.error ?? "Something went wrong", ok: false }); return false; }
      setMessage({ text: done, ok: true });
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function addCounter() {
    if (await send("POST", { label: newLabel }, "Counter added.")) setNewLabel("");
  }

  async function saveRename() {
    if (!editing) return;
    if (await send("PATCH", { id: editing.id, label: editing.label }, "Counter renamed.")) setEditing(null);
  }

  async function toggle(c: Counter) {
    await send("PATCH", { id: c.id, is_enabled: !c.is_enabled },
      c.is_enabled ? `${c.label} disabled. Volunteers can no longer choose it.` : `${c.label} enabled.`);
  }

  const active = counters.filter(c => c.is_enabled).length;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>BIB Collection Counters</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 20px", lineHeight: 1.6 }}>
        Add the counters volunteers use at the BIB desk. Disable a counter to stop it being chosen. There is no fixed number.
        <br />Active now: <strong style={{ color: GREEN }}>{active}</strong>
      </p>

      {message && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          background: message.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${message.ok ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.3)"}`,
          color: message.ok ? GREEN : "#f87171",
        }}>{message.text}</div>
      )}

      <form onSubmit={e => { e.preventDefault(); if (newLabel.trim()) void addCounter(); }}
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="New counter, e.g. Counter 4"
          maxLength={40} style={{ ...INPUT, flex: 1, minWidth: 180 }} />
        <button type="submit" disabled={busy || !newLabel.trim()} style={{
          padding: "9px 16px", background: busy || !newLabel.trim() ? "rgba(255,255,255,0.05)" : ACCENT,
          border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Add counter</button>
      </form>

      {loading ? <div style={{ color: MUTED, padding: 24, textAlign: "center" }}>Loading…</div> : counters.length === 0 ? (
        <div style={{ color: MUTED, padding: 24, textAlign: "center", fontSize: 14 }}>No counters yet. Add the first one above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {counters.map(c => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
              opacity: c.is_enabled ? 1 : 0.55,
            }}>
              {editing?.id === c.id ? (
                <>
                  <input value={editing.label} maxLength={40} onChange={e => setEditing({ id: c.id, label: e.target.value })}
                    style={{ ...INPUT, flex: 1, minWidth: 160 }} />
                  <button onClick={saveRename} disabled={busy} style={{ padding: "7px 12px", background: GREEN, border: "none", borderRadius: 7, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                  <button onClick={() => setEditing(null)} style={{ padding: "7px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: MUTED, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>{c.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.is_enabled ? GREEN : MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {c.is_enabled ? "Active" : "Disabled"}
                  </span>
                  <button onClick={() => setEditing({ id: c.id, label: c.label })} disabled={busy} style={{ padding: "7px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Rename</button>
                  <button onClick={() => toggle(c)} disabled={busy} style={{ padding: "7px 12px", background: c.is_enabled ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${c.is_enabled ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`, borderRadius: 7, color: c.is_enabled ? "#f87171" : GREEN, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    {c.is_enabled ? "Disable" : "Enable"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
