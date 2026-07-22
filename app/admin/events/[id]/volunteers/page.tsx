"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const OPS_ROLE_LABELS: Record<string, string> = {
  event_admin:       "Event Admin",
  registration_desk: "Registration Desk",
  checkin:           "Check-In",
  tshirt:            "T-Shirt Distribution",
  breakfast:         "Breakfast",
  bib:               "BIB Collection",
  medal:             "Medal",
  certificate:       "Certificate",
  support:           "Support Desk",
  medical:           "Medical",
  photography:       "Photography",
};

interface PortalUser { id: string; email: string; name: string; is_active: boolean }
interface Assignment { id: string; role: string; is_active: boolean; created_at: string; event_portal_users: PortalUser }

const S: Record<string, React.CSSProperties> = {
  input:      { padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  btn:        { padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#ccc", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  btnPrimary: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#e8620a", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  btnDanger:  { padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.08)", color: "#f87171", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" },
  label:      { fontSize: 10, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", fontWeight: 700, display: "block", marginBottom: 5 },
};

export default function VolunteersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [form,        setForm]        = useState({ email: "", name: "", password: "", role: "checkin" });
  const [isExisting,  setIsExisting]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState("");
  const [resetId,     setResetId]     = useState<string | null>(null);
  const [resetPwd,    setResetPwd]    = useState("");
  const [resetting,   setResetting]   = useState(false);
  const [copied,      setCopied]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/events/${eventId}/portal-users`);
      if (r.status === 401) { router.replace("/admin/login"); return; }
      if (r.ok) { const d = await r.json() as { assignments: Assignment[] }; setAssignments(d.assignments ?? []); }
    } finally { setLoading(false); }
  }, [eventId, router]);

  useEffect(() => { void load(); }, [load]);

  async function addVolunteer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg("");
    const body: Record<string, string> = { email: form.email.trim(), name: form.name.trim(), role: form.role };
    if (!isExisting) body.password = form.password;
    const r = await fetch(`/api/admin/events/${eventId}/portal-users`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (r.ok) {
      setMsg("Added successfully!");
      setForm({ email: "", name: "", password: "", role: "checkin" });
      setIsExisting(false);
      void load();
    } else { setMsg(d.error ?? "Error"); }
    setSaving(false);
  }

  async function removeAssignment(assignmentId: string) {
    if (!confirm("Remove this volunteer's access?")) return;
    await fetch(`/api/admin/events/${eventId}/portal-users?assignment_id=${assignmentId}`, { method: "DELETE" });
    void load();
  }

  async function resetPassword(portalUserId: string) {
    if (!resetPwd || resetPwd.length < 8) { setMsg("Password must be at least 8 characters."); return; }
    setResetting(true);
    const r = await fetch(`/api/admin/events/${eventId}/portal-users`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal_user_id: portalUserId, password: resetPwd }),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (r.ok) { setMsg("Password reset."); setResetId(null); setResetPwd(""); }
    else setMsg(d.error ?? "Error");
    setResetting(false);
  }

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal/login?event=${eventId}`
    : `/portal/login?event=${eventId}`;

  function copyPortalUrl() {
    void navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href={`/admin/events/${eventId}/manage`} style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Event Hub</Link>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Volunteers & Portal Users</span>
        <span style={{ fontSize: 11, color: "#555" }}>{assignments.length} active</span>
      </nav>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* Portal login URL */}
        <div style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#e8620a", fontWeight: 700, flexShrink: 0 }}>Portal Login URL</span>
          <code style={{ flex: 1, fontSize: 11, color: "#888", wordBreak: "break-all" }}>{portalUrl}</code>
          <button style={{ ...S.btn, flexShrink: 0, color: copied ? "#4ade80" : "#ccc" }} onClick={copyPortalUrl}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Add volunteer form */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 14 }}>Add Volunteer / Portal User</div>

          <form onSubmit={e => void addVolunteer(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={S.label}>Email</label>
                <input style={S.input} type="email" required value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="volunteer@example.com" />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={S.label}>Full Name</label>
                <input style={S.input} required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Display name" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 180px" }}>
                <label style={S.label}>Role</label>
                <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }}
                  value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {Object.entries(OPS_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>Password</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#555", cursor: "pointer" }}>
                    <input type="checkbox" checked={isExisting} onChange={e => setIsExisting(e.target.checked)} style={{ accentColor: "#e8620a" }} />
                    Existing user (no password)
                  </label>
                </div>
                {!isExisting && (
                  <input style={S.input} type="password" minLength={8} required={!isExisting}
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 chars" />
                )}
              </div>
            </div>

            {msg && <div style={{ fontSize: 12, color: msg.includes("Error") || msg.includes("error") || msg.includes("Password") ? "#f87171" : "#4ade80" }}>{msg}</div>}

            <button type="submit" style={{ ...S.btnPrimary, alignSelf: "flex-start" }} disabled={saving}>
              {saving ? "Adding…" : "Add Volunteer"}
            </button>
          </form>
        </div>

        {/* Assignments list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#555" }}>Loading…</div>
        ) : assignments.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#555" }}>No volunteers assigned yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assignments.map(a => {
              const u = a.event_portal_users;
              const isResetting = resetId === a.id;
              return (
                <div key={a.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {/* Avatar */}
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#e8620a", flexShrink: 0 }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#eee" }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{u.email}</div>
                    </div>
                    {/* Role badge */}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.25)", color: "#e8620a", flexShrink: 0 }}>
                      {OPS_ROLE_LABELS[a.role] ?? a.role}
                    </span>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button style={S.btn} onClick={() => { setResetId(isResetting ? null : a.id); setResetPwd(""); setMsg(""); }}>
                        {isResetting ? "Cancel" : "Reset PWD"}
                      </button>
                      <button style={S.btnDanger} onClick={() => void removeAssignment(a.id)}>Remove</button>
                    </div>
                  </div>
                  {/* Reset password inline */}
                  {isResetting && (
                    <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input style={{ ...S.input, maxWidth: 220 }} type="password" minLength={8}
                        value={resetPwd} onChange={e => setResetPwd(e.target.value)}
                        placeholder="New password (min 8 chars)" autoFocus />
                      <button style={{ ...S.btnPrimary, padding: "8px 14px", fontSize: 12 }}
                        onClick={() => void resetPassword(u.id)} disabled={resetting}>
                        {resetting ? "Saving…" : "Set Password"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
