"use client";

import { useState, useEffect } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";

const ROLES = [
  { value: "super_admin",       label: "Super Admin",       superOnly: true },
  { value: "event_admin",       label: "Event Admin",       superOnly: false },
  { value: "verification_team", label: "Verification Team", superOnly: false },
  { value: "bib_collection",    label: "BIB Collection",    superOnly: false },
  { value: "checkin_team",      label: "Check-in Team",     superOnly: false },
  { value: "support_desk",      label: "Support Desk",      superOnly: false },
];

type StaffUser = {
  id: string; email: string; name: string;
  role: string; is_active: boolean; created_at: string;
};

type ModalMode = "create" | "edit";

const ROLE_COLOR: Record<string, string> = {
  super_admin: "#ef4444", event_admin: ACCENT, verification_team: "#6366f1",
  bib_collection: "#f59e0b", checkin_team: GREEN, support_desk: "#60a5fa",
};

export default function StaffPage() {
  const [staff,   setStaff]   = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<ModalMode | null>(null);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form,    setForm]    = useState({ email: "", name: "", role: "support_desk", password: "", is_active: true });
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [myRole,  setMyRole]  = useState<string>("");

  function load() {
    setLoading(true);
    fetch("/api/it-run/admin/staff")
      .then(r => r.json())
      .then(d => setStaff(d.staff ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    fetch("/api/it-run/portal/auth")
      .then(r => r.json())
      .then(d => setMyRole(d.role ?? ""))
      .catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ email: "", name: "", role: "support_desk", password: "", is_active: true });
    setModal("create"); setMsg(null);
  }

  function openEdit(user: StaffUser) {
    setEditing(user);
    setForm({ email: user.email, name: user.name, role: user.role, password: "", is_active: user.is_active });
    setModal("edit"); setMsg(null);
  }

  function upd(key: string, val: string | boolean) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, unknown> = modal === "create"
        ? { email: form.email, name: form.name, role: form.role, password: form.password }
        : { id: editing!.id, name: form.name, role: form.role, is_active: form.is_active,
            ...(form.password ? { password: form.password } : {}) };

      const res = await fetch("/api/it-run/admin/staff", {
        method: modal === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ text: d.error ?? "Failed", ok: false }); return; }
      setMsg({ text: modal === "create" ? "Staff user created" : "Staff user updated", ok: true });
      setModal(null);
      load();
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Staff / User Management</h1>
          <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>Manage Event Admin Portal access. Passwords are HMAC-hashed server-side.</p>
        </div>
        <button onClick={openCreate}
          style={{ padding: "10px 20px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Staff
        </button>
      </div>

      {msg && !modal && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.ok ? GREEN : "#f87171" }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {staff.map(u => {
          const rc = ROLE_COLOR[u.role] ?? "#888";
          return (
            <div key={u.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: u.is_active ? "#fff" : "#555" }}>{u.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${rc}18`, border: `1px solid ${rc}30`, color: rc }}>
                    {ROLES.find(r => r.value === u.role)?.label ?? u.role}
                  </span>
                  {!u.is_active && <span style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "2px 7px", borderRadius: 5, border: "1px solid rgba(239,68,68,0.2)" }}>Inactive</span>}
                </div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{u.email}</div>
                <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Created {new Date(u.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
              </div>
              <button onClick={() => openEdit(u)}
                style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Edit
              </button>
            </div>
          );
        })}
        {staff.length === 0 && <div style={{ color: "#555", padding: 28, textAlign: "center" }}>No staff users found</div>}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={submit} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 460, padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{modal === "create" ? "Add Staff User" : `Edit: ${editing?.name}`}</div>
              <button type="button" onClick={() => setModal(null)}
                style={{ padding: "4px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>
                ✕
              </button>
            </div>

            {msg && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                color: msg.ok ? GREEN : "#f87171" }}>
                {msg.text}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {modal === "create" && (
                <F label="Email" type="email" value={form.email} onChange={v => upd("email", v)} required />
              )}
              {modal === "edit" && (
                <div>
                  <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Email</div>
                  <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: "#555", fontSize: 14 }}>{editing?.email}</div>
                </div>
              )}
              <F label="Full Name" value={form.name} onChange={v => upd("name", v)} required />
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Role</label>
                <select value={form.role} onChange={e => upd("role", e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                  {ROLES.filter(r => !r.superOnly || myRole === "super_admin").map(r => <option key={r.value} value={r.value} style={{ background: "#1a1a1a" }}>{r.label}</option>)}
                </select>
              </div>
              <F label={modal === "create" ? "Password (min 8 chars)" : "New Password (leave blank to keep)"} type="password" value={form.password} onChange={v => upd("password", v)} required={modal === "create"} />
              {modal === "edit" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => upd("is_active", e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: GREEN }} />
                  <span style={{ fontSize: 13, color: "#ccc" }}>Active</span>
                </label>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: "12px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {saving ? "Saving…" : modal === "create" ? "Create User" : "Save Changes"}
              </button>
              <button type="button" onClick={() => setModal(null)}
                style={{ padding: "12px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function F({ label, type = "text", value, onChange, required }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
    </div>
  );
}
