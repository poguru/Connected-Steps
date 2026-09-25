"use client";

import { useState, useEffect } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";

type Category = {
  id: string; name: string; slug: string; category_type: string;
  distance_km: number | null; price_rupees: number; early_bird_price: number | null;
  early_bird_ends_at: string | null; max_participants: number | null;
  current_participants: number; is_active: boolean; sort_order: number;
  color: string; description: string | null;
  includes_bib: boolean; includes_timing: boolean; includes_medal: boolean;
  includes_tshirt: boolean; includes_certificate: boolean;
};

function pct(current: number, max: number | null) {
  if (!max) return null;
  return Math.min(100, Math.round((current / max) * 100));
}

export default function CategoriesPage() {
  const [cats,    setCats]    = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form,    setForm]    = useState<Partial<Category>>({});
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/it-run/admin/categories")
      .then(r => r.json())
      .then(d => setCats(d.categories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(cat: Category) {
    setEditing(cat);
    setForm({ ...cat });
    setMsg(null);
  }

  function field(key: keyof Category, label: string, type = "text") {
    const val = (form[key] ?? "") as string | number | boolean;
    if (type === "boolean") {
      return (
        <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
            style={{ width: 14, height: 14, accentColor: ACCENT }} />
          <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
        </label>
      );
    }
    return (
      <div key={key}>
        <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{label}</label>
        <input type={type} value={String(val)} onChange={e => setForm(f => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
      </div>
    );
  }

  async function save() {
    if (!editing) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/it-run/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editing.id }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ text: d.error ?? "Save failed", ok: false }); return; }
      setCats(prev => prev.map(c => c.id === editing.id ? { ...c, ...form } as Category : c));
      setEditing(null);
      setMsg({ text: "Category saved", ok: true });
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Categories · Pricing · Capacity</h1>
        <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>Edit registration categories, prices, inclusions and slot limits. Slug and type are locked.</p>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.ok ? GREEN : "#f87171" }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {cats.map(cat => {
          const fill = pct(cat.current_participants, cat.max_participants);
          return (
            <div key={cat.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ height: 3, background: cat.color ?? ACCENT }} />
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{cat.name}</span>
                      <span style={{ fontSize: 11, color: cat.color ?? ACCENT, background: `${cat.color ?? ACCENT}18`, padding: "2px 8px", borderRadius: 6 }}>{cat.category_type}</span>
                      {!cat.is_active && <span style={{ fontSize: 11, color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "2px 8px", borderRadius: 6 }}>Inactive</span>}
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: GREEN, fontWeight: 700 }}>₹{cat.price_rupees.toLocaleString("en-IN")}</span>
                      {cat.early_bird_price && <span style={{ fontSize: 12, color: "#f59e0b" }}>Early bird ₹{cat.early_bird_price.toLocaleString("en-IN")}</span>}
                      <span style={{ fontSize: 13, color: "#888" }}>
                        {cat.current_participants}{cat.max_participants ? `/${cat.max_participants}` : ""} registered
                        {fill !== null && ` (${fill}%)`}
                      </span>
                    </div>
                    {fill !== null && (
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 10, width: "100%", maxWidth: 280 }}>
                        <div style={{ height: "100%", width: `${fill}%`, background: fill > 90 ? "#ef4444" : fill > 70 ? "#f59e0b" : GREEN, borderRadius: 2 }} />
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {[
                        ["BIB", cat.includes_bib], ["Timing", cat.includes_timing],
                        ["Medal", cat.includes_medal], ["T-Shirt", cat.includes_tshirt], ["Certificate", cat.includes_certificate],
                      ].map(([lbl, included]) => (
                        <span key={String(lbl)} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5,
                          background: included ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)",
                          color: included ? GREEN : "#555",
                          border: `1px solid ${included ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                          {included ? "✓" : "✗"} {lbl}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => startEdit(cat)}
                    style={{ padding: "8px 16px", background: "rgba(232,98,10,0.1)", border: `1px solid rgba(232,98,10,0.3)`, borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Edit
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Edit: {editing.name}</div>
              <button onClick={() => setEditing(null)}
                style={{ padding: "4px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>
                ✕
              </button>
            </div>

            {msg?.ok === false && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                {msg.text}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {field("name",            "Name")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {field("price_rupees",    "Price (₹)", "number")}
                {field("early_bird_price","Early Bird Price (₹)", "number")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {field("max_participants", "Max Participants", "number")}
                {field("distance_km",      "Distance (km)", "number")}
              </div>
              {field("early_bird_ends_at","Early Bird Ends At", "datetime-local")}
              {field("color",            "Accent Color (hex)")}
              {field("sort_order",       "Sort Order", "number")}
              {field("description",      "Description")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {field("includes_bib",         "Includes BIB",         "boolean")}
                {field("includes_timing",       "Includes Timing",      "boolean")}
                {field("includes_medal",        "Includes Medal",       "boolean")}
                {field("includes_tshirt",       "Includes T-Shirt",     "boolean")}
                {field("includes_certificate",  "Includes Certificate", "boolean")}
                {field("is_active",             "Active",               "boolean")}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={save} disabled={saving}
                style={{ flex: 1, padding: "12px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(null)}
                style={{ padding: "12px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
