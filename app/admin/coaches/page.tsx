"use client";

import { useState, useEffect } from "react";

interface Coach {
  id:             string;
  name:           string;
  email:          string;
  specialization: string | null;
  is_active:      boolean;
  is_admin:       boolean;
  has_login:      boolean;
  created_at:     string;
}

const S = {
  inp: {
    width: "100%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  } as React.CSSProperties,
  btn: (primary = true): React.CSSProperties => ({
    padding: "10px 20px", background: primary ? "#e8620a" : "rgba(255,255,255,0.06)",
    border: "none", borderRadius: 8, color: primary ? "#fff" : "#aaa",
    fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  }),
};

export default function AdminCoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Modal state
  const [modal,    setModal]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState("");
  const [saveOk,   setSaveOk]   = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", specialization: "", phone: "",
  });

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/coaches");
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed to load"); return; }
      setCoaches(d.coaches ?? []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openModal() {
    setForm({ name: "", email: "", password: "", specialization: "", phone: "" });
    setSaveErr(""); setSaveOk(false);
    setModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(""); setSaveOk(false); setSaving(true);
    try {
      const r = await fetch("/api/admin/coaches", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setSaveErr(d.error ?? "Failed"); return; }
      setSaveOk(true);
      await load();
      setTimeout(() => setModal(false), 1200);
    } catch { setSaveErr("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: 0 }}>Coaches</h1>
          <p style={{ fontSize: 12, color: "#555", margin: "4px 0 0" }}>
            Manage coach portal logins and profiles
          </p>
        </div>
        <button onClick={openModal} style={S.btn()}>+ Create Coach Login</button>
      </div>

      {error && (
        <div style={{ background: "rgba(220,50,50,0.1)", border: "1px solid rgba(220,50,50,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>Loading…</div>
      ) : coaches.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>No coaches yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {coaches.map(c => (
            <div key={c.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>

              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8620a22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#e8620a", flexShrink: 0 }}>
                {c.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{c.email}</div>
                {c.specialization && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{c.specialization}</div>}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.is_admin && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#e8620a", background: "#e8620a15", border: "1px solid #e8620a30", padding: "2px 8px", borderRadius: 999 }}>ADMIN</span>
                )}
                {c.is_active ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", background: "#4ade8015", border: "1px solid #4ade8030", padding: "2px 8px", borderRadius: 999 }}>ACTIVE</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171", background: "#f8717115", border: "1px solid #f8717130", padding: "2px 8px", borderRadius: 999 }}>INACTIVE</span>
                )}
                {c.has_login ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", background: "#60a5fa15", border: "1px solid #60a5fa30", padding: "2px 8px", borderRadius: 999 }}>HAS LOGIN</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#888", background: "#88888815", border: "1px solid #88888830", padding: "2px 8px", borderRadius: 999 }}>NO LOGIN</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Coach Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "2rem", width: "100%", maxWidth: 440 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Create Coach Login</div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
            </div>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Full Name *
                </label>
                <input
                  style={S.inp} required
                  placeholder="e.g. Ashokan K"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Email *
                </label>
                <input
                  style={S.inp} required type="email"
                  placeholder="coach@connectedsteps.in"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Password * <span style={{ color: "#444", fontWeight: 400 }}>(min 8 chars)</span>
                </label>
                <input
                  style={S.inp} required type="password"
                  placeholder="Set their login password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Specialization
                </label>
                <input
                  style={S.inp}
                  placeholder="e.g. Marathon Coach"
                  value={form.specialization}
                  onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Phone
                </label>
                <input
                  style={S.inp}
                  placeholder="10-digit mobile number"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>

              {saveErr && (
                <div style={{ background: "rgba(220,50,50,0.1)", border: "1px solid rgba(220,50,50,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171" }}>
                  {saveErr}
                </div>
              )}
              {saveOk && (
                <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#4ade80" }}>
                  Coach login created! They can now sign in at /coach/login
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setModal(false)} style={{ ...S.btn(false), flex: 1 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ ...S.btn(), flex: 1 }}>
                  {saving ? "Creating…" : "Create Login"}
                </button>
              </div>

              <p style={{ fontSize: 11, color: "#444", margin: 0, textAlign: "center" }}>
                Coach can log in at <strong style={{ color: "#666" }}>/coach/login</strong>
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
