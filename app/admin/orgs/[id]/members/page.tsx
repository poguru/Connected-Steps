"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Member {
  id: string;
  user_email: string;
  role: string;
  is_active: boolean;
  invited_by: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner:             { label: "Owner",            color: "#e8620a" },
  admin:             { label: "Admin",            color: "#a78bfa" },
  finance:           { label: "Finance",          color: "#4ade80" },
  operations:        { label: "Operations",       color: "#60a5fa" },
  volunteer_manager: { label: "Volunteer Mgr",    color: "#34d399" },
  communications:    { label: "Communications",   color: "#fb923c" },
  support:           { label: "Support",          color: "#f9a8d4" },
  read_only:         { label: "Read Only",        color: "#6b7280" },
};

const ALL_ROLES = Object.keys(ROLE_LABELS);

export default function OrgMembersPage() {
  const params = useParams<{ id: string }>();
  const id     = params.id;

  const [members,   setMembers]   = useState<Member[]>([]);
  const [orgName,   setOrgName]   = useState("");
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [newEmail,  setNewEmail]  = useState("");
  const [newRole,   setNewRole]   = useState("read_only");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editRole,  setEditRole]  = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/orgs/${id}/members`).then(r => r.json()),
      fetch(`/api/admin/orgs/${id}`).then(r => r.json()),
    ]).then(([mData, oData]) => {
      setMembers(mData.members ?? []);
      setOrgName(oData.org?.name ?? "");
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr("");
    try {
      const r = await fetch(`/api/admin/orgs/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: newEmail, role: newRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNewEmail(""); setNewRole("read_only"); setShowAdd(false);
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  async function updateRole(user_email: string, role: string) {
    const r = await fetch(`/api/admin/orgs/${id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_email, role }),
    });
    if (r.ok) { setEditId(null); load(); }
  }

  async function toggleActive(m: Member) {
    await fetch(`/api/admin/orgs/${id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_email: m.user_email, is_active: !m.is_active }),
    });
    load();
  }

  async function removeMember(user_email: string) {
    if (!confirm(`Remove ${user_email} from this organization?`)) return;
    await fetch(`/api/admin/orgs/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_email }),
    });
    load();
  }

  return (
    <div style={{ padding: "28px 24px", maxWidth: 900, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
        <Link href="/admin/orgs" style={{ color: "#555", textDecoration: "none" }}>Organizations</Link>
        {" / "}
        <Link href={`/admin/orgs/${id}`} style={{ color: "#555", textDecoration: "none" }}>{orgName}</Link>
        {" / Members"}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Members</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{members.length} total</div>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ padding: "8px 16px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
          + Add Member
        </button>
      </div>

      {/* Add member form */}
      {showAdd && (
        <form onSubmit={addMember}
          style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5 }}>Email address</label>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} required type="email" placeholder="member@org.com"
              style={{ width: "100%", padding: "8px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5 }}>Role</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13 }}>
              {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r].label}</option>)}
            </select>
          </div>
          {err && <div style={{ width: "100%", fontSize: 12, color: "#f87171" }}>{err}</div>}
          <button type="submit" disabled={saving}
            style={{ padding: "8px 18px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1, flexShrink: 0 }}>
            {saving ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {/* Members list */}
      <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#555" }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Member","Role","Status","Actions"].map(h => (
                <div key={h} style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{h}</div>
              ))}
            </div>
            {members.map(m => {
              const roleMeta = ROLE_LABELS[m.role] ?? { label: m.role, color: "#888" };
              return (
                <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#ddd", fontWeight: 500 }}>{m.user_email}</div>
                    {m.invited_by && <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>Invited by {m.invited_by}</div>}
                  </div>
                  <div>
                    {editId === m.id ? (
                      <select value={editRole} onChange={e => setEditRole(e.target.value)} onBlur={() => updateRole(m.user_email, editRole)}
                        style={{ padding: "4px 8px", background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 12 }}>
                        {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r].label}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => { setEditId(m.id); setEditRole(m.role); }}
                        style={{ fontSize: 11, fontWeight: 700, color: roleMeta.color, background: `${roleMeta.color}18`, padding: "2px 10px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        {roleMeta.label}
                      </button>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: m.is_active ? "#4ade80" : "#6b7280", fontWeight: 600 }}>
                      {m.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => toggleActive(m)}
                      style={{ fontSize: 11, color: "#888", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                      {m.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => removeMember(m.user_email)}
                      style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Role legend */}
      <div style={{ marginTop: 20, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Role Permissions</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ALL_ROLES.map(r => (
            <span key={r} style={{ fontSize: 11, color: ROLE_LABELS[r].color, background: `${ROLE_LABELS[r].color}12`, padding: "3px 10px", borderRadius: 999, border: `1px solid ${ROLE_LABELS[r].color}30` }}>
              {ROLE_LABELS[r].label}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#444", marginTop: 10, lineHeight: 1.6 }}>
          <strong style={{ color: "#666" }}>Owner</strong> — full control including billing and member management.<br />
          <strong style={{ color: "#666" }}>Admin</strong> — everything except billing changes and org deletion.<br />
          <strong style={{ color: "#666" }}>Finance</strong> — view financial data and export reports.<br />
          <strong style={{ color: "#666" }}>Operations</strong> — manage events, volunteers, and race-day operations.<br />
          <strong style={{ color: "#666" }}>Volunteer Manager</strong> — assign volunteers and manage check-in.<br />
          <strong style={{ color: "#666" }}>Communications</strong> — send messages and manage templates.<br />
          <strong style={{ color: "#666" }}>Support</strong> — view registrations and assist participants.<br />
          <strong style={{ color: "#666" }}>Read Only</strong> — view access only.
        </div>
      </div>
    </div>
  );
}
