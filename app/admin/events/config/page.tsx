"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventType {
  id:          string;
  name:        string;
  slug:        string;
  description: string | null;
  icon:        string;
  color:       string;
  is_active:   boolean;
  sort_order:  number;
}

interface EventCategory {
  id:          string;
  name:        string;
  slug:        string;
  description: string | null;
  is_active:   boolean;
  sort_order:  number;
}

type Tab = "types" | "categories";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const S = {
  page:     { padding: "28px 24px", maxWidth: 860, margin: "0 auto" } as const,
  h1:       { fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 } as const,
  sub:      { fontSize: 13, color: "#666", margin: 0 } as const,
  tabs:     { display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 4 } as const,
  card:     { background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" } as const,
  row:      { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" } as const,
  input:    { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 14, padding: "8px 12px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const } as const,
  btn:      { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600, transition: "opacity 0.15s" } as const,
  pill:     { fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 700, letterSpacing: "0.04em" } as const,
};

function tabStyle(active: boolean): React.CSSProperties {
  return { ...S.btn, background: active ? "#e8620a" : "transparent", color: active ? "#fff" : "#666", border: "none" };
}

function btnPrimary(extra?: React.CSSProperties): React.CSSProperties {
  return { ...S.btn, background: "#e8620a", color: "#fff", ...extra };
}
function btnGhost(extra?: React.CSSProperties): React.CSSProperties {
  return { ...S.btn, background: "rgba(255,255,255,0.05)", color: "#888", ...extra };
}
function btnDanger(extra?: React.CSSProperties): React.CSSProperties {
  return { ...S.btn, background: "rgba(239,68,68,0.12)", color: "#ef4444", ...extra };
}

// ── Inline edit cell ───────────────────────────────────────────────────────────

function InlineEdit({
  value, onSave, placeholder, style,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const [saving,  setSaving]  = useState(false);

  async function commit() {
    const v = draft.trim();
    if (!v || v === value) { setEditing(false); setDraft(value); return; }
    setSaving(true);
    try { await onSave(v); setEditing(false); }
    catch (err) { alert((err as Error).message); setDraft(value); setEditing(false); }
    finally { setSaving(false); }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(value); } }}
        style={{ ...S.input, ...(style ?? {}), width: "auto", minWidth: 140, padding: "4px 8px", fontSize: 13 }}
        disabled={saving}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => { setEditing(true); setDraft(value); }}
      onKeyDown={e => { if (e.key === "Enter") { setEditing(true); setDraft(value); } }}
      title="Click to rename"
      style={{ cursor: "text", color: "#fff", fontSize: 14, fontWeight: 600, borderBottom: "1px dashed rgba(255,255,255,0.15)", ...(style ?? {}) }}
    >
      {value}
    </span>
  );
}

// ── Event Types tab ────────────────────────────────────────────────────────────

function TypesTab() {
  const [types,    setTypes]    = useState<EventType[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newIcon,  setNewIcon]  = useState("🎯");
  const [newColor, setNewColor] = useState("#e8620a");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/event-config/types?all=1").then(r => r.json());
      setTypes(d.types ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/admin/event-config/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon: newIcon, color: newColor }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Failed"); return; }
      setTypes(prev => [...prev, d.type]);
      setNewName(""); setNewIcon("🎯"); setNewColor("#e8620a"); setCreating(false);
    } catch { setErr("Network error."); }
    finally { setSaving(false); }
  }

  async function patch(id: string, updates: Partial<EventType>) {
    const res = await fetch(`/api/admin/event-config/types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "Failed");
    setTypes(prev => prev.map(t => t.id === id ? { ...t, ...d.type } : t));
  }

  async function remove(id: string) {
    if (!confirm("Delete this event type? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/event-config/types/${id}`, { method: "DELETE" });
    const d   = await res.json();
    if (!res.ok) { alert(d.error ?? "Failed"); return; }
    setTypes(prev => prev.filter(t => t.id !== id));
  }

  async function moveUp(idx: number) {
    if (idx === 0) return;
    const a = types[idx]; const b = types[idx - 1];
    await Promise.all([
      patch(a.id, { sort_order: b.sort_order }),
      patch(b.id, { sort_order: a.sort_order }),
    ]);
    setTypes(prev => {
      const next = [...prev];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return next;
    });
  }

  async function moveDown(idx: number) {
    if (idx === types.length - 1) return;
    const a = types[idx]; const b = types[idx + 1];
    await Promise.all([
      patch(a.id, { sort_order: b.sort_order }),
      patch(b.id, { sort_order: a.sort_order }),
    ]);
    setTypes(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          {types.length} type{types.length !== 1 ? "s" : ""} — click a name to rename in place
        </p>
        {!creating && (
          <button style={btnPrimary()} onClick={() => setCreating(true)}>
            + Add type
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a" }}>New Event Type</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={newIcon} onChange={e => setNewIcon(e.target.value)} style={{ ...S.input, width: 56, textAlign: "center", fontSize: 18 }} placeholder="🎯" />
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 40, height: 38, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, background: "transparent", cursor: "pointer" }} />
            </div>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") create(); if (e.key === "Escape") { setCreating(false); setErr(""); } }}
              style={{ ...S.input, flex: 1, minWidth: 180 }}
              placeholder="e.g. Triathlon"
              autoFocus
            />
          </div>
          {err && <div style={{ color: "#ef4444", fontSize: 12 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnPrimary()} onClick={create} disabled={saving || !newName.trim()}>
              {saving ? "Saving…" : "Create"}
            </button>
            <button style={btnGhost()} onClick={() => { setCreating(false); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={S.card}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ width: 36, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Order</span>
          <span style={{ width: 40, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Icon</span>
          <span style={{ flex: 1, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Name / Slug</span>
          <span style={{ width: 70, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</span>
          <span style={{ width: 80, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" as const }}>Actions</span>
        </div>

        {types.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>No types yet.</div>
        )}

        {types.map((t, idx) => (
          <div key={t.id} style={{ ...S.row, background: t.is_active ? "transparent" : "rgba(255,255,255,0.01)", opacity: t.is_active ? 1 : 0.55 }}>
            {/* Reorder */}
            <div style={{ width: 36, display: "flex", flexDirection: "column", gap: 2 }}>
              <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ background: "none", border: "none", color: idx === 0 ? "#333" : "#555", cursor: idx === 0 ? "default" : "pointer", fontSize: 11, padding: "1px 4px", lineHeight: 1 }}>▲</button>
              <button onClick={() => moveDown(idx)} disabled={idx === types.length - 1} style={{ background: "none", border: "none", color: idx === types.length - 1 ? "#333" : "#555", cursor: idx === types.length - 1 ? "default" : "pointer", fontSize: 11, padding: "1px 4px", lineHeight: 1 }}>▼</button>
            </div>

            {/* Icon */}
            <div style={{ width: 40 }}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
            </div>

            {/* Name + slug */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineEdit value={t.name} onSave={name => patch(t.id, { name })} />
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{t.slug}</div>
            </div>

            {/* Status toggle */}
            <div style={{ width: 70 }}>
              <button
                onClick={() => patch(t.id, { is_active: !t.is_active })}
                style={{ ...S.pill, background: t.is_active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)", color: t.is_active ? "#22c55e" : "#666", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {t.is_active ? "Active" : "Disabled"}
              </button>
            </div>

            {/* Delete */}
            <div style={{ width: 80, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => remove(t.id)} style={btnDanger({ padding: "4px 10px", fontSize: 12 })}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Event Categories tab ───────────────────────────────────────────────────────

function CategoriesTab() {
  const [cats,     setCats]     = useState<EventCategory[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/event-config/categories?all=1").then(r => r.json());
      setCats(d.categories ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/admin/event-config/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Failed"); return; }
      setCats(prev => [...prev, d.category]);
      setNewName(""); setCreating(false);
    } catch { setErr("Network error."); }
    finally { setSaving(false); }
  }

  async function patch(id: string, updates: Partial<EventCategory>) {
    const res = await fetch(`/api/admin/event-config/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "Failed");
    setCats(prev => prev.map(c => c.id === id ? { ...c, ...d.category } : c));
  }

  async function remove(id: string) {
    if (!confirm("Delete this category? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/event-config/categories/${id}`, { method: "DELETE" });
    const d   = await res.json();
    if (!res.ok) { alert(d.error ?? "Failed"); return; }
    setCats(prev => prev.filter(c => c.id !== id));
  }

  async function moveUp(idx: number) {
    if (idx === 0) return;
    const a = cats[idx]; const b = cats[idx - 1];
    await Promise.all([
      patch(a.id, { sort_order: b.sort_order }),
      patch(b.id, { sort_order: a.sort_order }),
    ]);
    setCats(prev => {
      const next = [...prev];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return next;
    });
  }

  async function moveDown(idx: number) {
    if (idx === cats.length - 1) return;
    const a = cats[idx]; const b = cats[idx + 1];
    await Promise.all([
      patch(a.id, { sort_order: b.sort_order }),
      patch(b.id, { sort_order: a.sort_order }),
    ]);
    setCats(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          {cats.length} categor{cats.length !== 1 ? "ies" : "y"} — click a name to rename in place
        </p>
        {!creating && (
          <button style={btnPrimary()} onClick={() => setCreating(true)}>
            + Add category
          </button>
        )}
      </div>

      {creating && (
        <div style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a" }}>New Event Category</div>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") create(); if (e.key === "Escape") { setCreating(false); setErr(""); } }}
            style={{ ...S.input }}
            placeholder="e.g. Ultramarathon"
            autoFocus
          />
          {err && <div style={{ color: "#ef4444", fontSize: 12 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnPrimary()} onClick={create} disabled={saving || !newName.trim()}>
              {saving ? "Saving…" : "Create"}
            </button>
            <button style={btnGhost()} onClick={() => { setCreating(false); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ width: 36, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Order</span>
          <span style={{ flex: 1, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Name / Slug</span>
          <span style={{ width: 70, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</span>
          <span style={{ width: 80, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" as const }}>Actions</span>
        </div>

        {cats.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>No categories yet.</div>
        )}

        {cats.map((c, idx) => (
          <div key={c.id} style={{ ...S.row, background: c.is_active ? "transparent" : "rgba(255,255,255,0.01)", opacity: c.is_active ? 1 : 0.55 }}>
            <div style={{ width: 36, display: "flex", flexDirection: "column", gap: 2 }}>
              <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ background: "none", border: "none", color: idx === 0 ? "#333" : "#555", cursor: idx === 0 ? "default" : "pointer", fontSize: 11, padding: "1px 4px", lineHeight: 1 }}>▲</button>
              <button onClick={() => moveDown(idx)} disabled={idx === cats.length - 1} style={{ background: "none", border: "none", color: idx === cats.length - 1 ? "#333" : "#555", cursor: idx === cats.length - 1 ? "default" : "pointer", fontSize: 11, padding: "1px 4px", lineHeight: 1 }}>▼</button>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineEdit value={c.name} onSave={name => patch(c.id, { name })} />
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{c.slug}</div>
            </div>

            <div style={{ width: 70 }}>
              <button
                onClick={() => patch(c.id, { is_active: !c.is_active })}
                style={{ ...S.pill, background: c.is_active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)", color: c.is_active ? "#22c55e" : "#666", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {c.is_active ? "Active" : "Disabled"}
              </button>
            </div>

            <div style={{ width: 80, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => remove(c.id)} style={btnDanger({ padding: "4px 10px", fontSize: 12 })}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EventConfigPage() {
  const [tab, setTab] = useState<Tab>("types");

  return (
    <div style={S.page}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={S.h1}>Event Configuration</h1>
        <p style={{ ...S.sub, marginTop: 4 }}>
          Manage the event types and categories shown in event creation and editing.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={S.tabs}>
          <button style={tabStyle(tab === "types")}      onClick={() => setTab("types")}>Event Types</button>
          <button style={tabStyle(tab === "categories")} onClick={() => setTab("categories")}>Categories</button>
        </div>
      </div>

      {tab === "types"      && <TypesTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}
