"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Sponsor {
  id:            string;
  event_id:      string;
  name:          string;
  tier:          string;
  logo_url:      string | null;
  website_url:   string | null;
  description:   string | null;
  display_order: number;
  visible:       boolean;
  created_at:    string;
}

const TIERS = [
  { value: "title",        label: "Title Sponsor",        color: "#fbbf24" },
  { value: "sports",       label: "Sports Partner",       color: "#e8620a" },
  { value: "refreshment",  label: "Refreshment Partner",  color: "#4ade80" },
  { value: "hydration",    label: "Hydration Partner",    color: "#60a5fa" },
  { value: "medical",      label: "Medical Partner",      color: "#f87171" },
  { value: "photography",  label: "Photography Partner",  color: "#a78bfa" },
  { value: "community",    label: "Community Partner",    color: "#34d399" },
  { value: "support",      label: "Support Partner",      color: "#888" },
];

const tierColor = (t: string) => TIERS.find(x => x.value === t)?.color ?? "#888";
const tierLabel = (t: string) => TIERS.find(x => x.value === t)?.label ?? t;

const S: React.CSSProperties = { padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

const BLANK = { name: "", tier: "community", logo_url: "", website_url: "", description: "", display_order: 0 };

export default function SponsorsPage() {
  const { id: eventId } = useParams() as { id: string };
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState(BLANK);
  const [editing,  setEditing]  = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState("");

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => { void load(); }, [eventId]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const res  = await fetch(`/api/admin/events/${eventId}/sponsors`);
    const data = await res.json();
    setSponsors(data.sponsors ?? []);
    setLoading(false);
  }

  async function save() {
    if (!form.name.trim()) { showToast("Name is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await fetch(`/api/admin/events/${eventId}/sponsors`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sponsor_id: editing, ...form }),
        });
        showToast("Sponsor updated");
      } else {
        await fetch(`/api/admin/events/${eventId}/sponsors`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        showToast("Sponsor added");
      }
      setForm(BLANK); setEditing(null);
      await load();
    } finally { setSaving(false); }
  }

  async function toggleVisible(s: Sponsor) {
    await fetch(`/api/admin/events/${eventId}/sponsors`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsor_id: s.id, visible: !s.visible }),
    });
    setSponsors(ss => ss.map(x => x.id === s.id ? { ...x, visible: !x.visible } : x));
  }

  async function deleteSponsor(id: string) {
    if (!confirm("Remove this sponsor?")) return;
    await fetch(`/api/admin/events/${eventId}/sponsors`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsor_id: id }),
    });
    setSponsors(ss => ss.filter(x => x.id !== id));
    showToast("Sponsor removed");
  }

  function startEdit(s: Sponsor) {
    setEditing(s.id);
    setForm({ name: s.name, tier: s.tier, logo_url: s.logo_url ?? "", website_url: s.website_url ?? "", description: s.description ?? "", display_order: s.display_order });
  }

  const card: React.CSSProperties = { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Sponsors</span>
        </div>
        <Link href={`/admin/events/${eventId}/manage`} style={{ padding: "5px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
          Back to Hub
        </Link>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.75rem 2rem" }}>

        {/* ── Add / Edit form ── */}
        <div style={{ ...card, marginBottom: 24, border: "1px solid rgba(232,98,10,0.2)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 16 }}>
            {editing ? "Edit Sponsor" : "Add Sponsor"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" as const }}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Decathlon India" style={S} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" as const }}>Tier</label>
              <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} style={{ ...S, cursor: "pointer" } as React.CSSProperties}>
                {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" as const }}>Logo URL</label>
              <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://…/logo.png" style={S} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" as const }}>Website URL</label>
              <input value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://sponsor.com" style={S} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" as const }}>Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description for event page" style={S} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" as const }}>Display Order</label>
              <input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))} style={S} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={saving} style={{ padding: "9px 22px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Sponsor"}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setForm(BLANK); }} style={{ padding: "9px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* ── Sponsor list ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#555" }}>Loading…</div>
        ) : sponsors.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "3rem" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
            <div style={{ color: "#555", fontSize: 14 }}>No sponsors added yet</div>
            <div style={{ color: "#444", fontSize: 12, marginTop: 6 }}>Sponsors will appear on the event page and in emails</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sponsors.map(s => (
              <div key={s.id} style={{ ...card, display: "flex", alignItems: "center", gap: 14, opacity: s.visible ? 1 : 0.5 }}>
                {s.logo_url ? (
                  <img src={s.logo_url} alt={s.name} style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, background: "#fff", padding: 4, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>🤝</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{s.name}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${tierColor(s.tier)}18`, color: tierColor(s.tier), border: `1px solid ${tierColor(s.tier)}30` }}>
                      {tierLabel(s.tier)}
                    </span>
                    {s.website_url && <a href={s.website_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#60a5fa", textDecoration: "none" }}>↗ Website</a>}
                    {s.description && <span style={{ fontSize: 11, color: "#555" }}>{s.description.slice(0, 60)}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => toggleVisible(s)} style={{ padding: "5px 10px", background: s.visible ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${s.visible ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, color: s.visible ? "#4ade80" : "#555", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {s.visible ? "Visible" : "Hidden"}
                  </button>
                  <button onClick={() => startEdit(s)} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#aaa", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                  <button onClick={() => deleteSponsor(s.id)} style={{ padding: "5px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, color: "#f87171", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20, padding: "12px 14px", background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 8, fontSize: 12, color: "#60a5fa", lineHeight: 1.6 }}>
          💡 Sponsors are displayed on the public event page. Logo and tier are shown to participants. Upload logos to Supabase Storage and paste the public URL above.
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
