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
  sponsor:           "Sponsor",
};

interface PortalUser {
  id: string; email: string; name: string; is_active: boolean; phone: string | null;
}
interface Assignment {
  id: string; role: string; is_active: boolean; created_at: string;
  notes: string | null; shift_start: string | null; shift_end: string | null;
  event_portal_users: PortalUser;
}
interface VolActivity {
  email: string; total_scans: number; is_active: boolean;
  last_active: string | null; by_service: Record<string, number>;
}

// ── Style tokens ──────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  card:       { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" },
  input:      { padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 12, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const },
  btn:        { padding: "6px 13px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#ccc", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", lineHeight: 1.4 },
  btnOrange:  { padding: "7px 15px", borderRadius: 7, border: "none", background: "#e8620a", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  btnGhost:   { padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#666", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" },
  btnDanger:  { padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#f87171", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" },
  label:      { fontSize: 10, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", fontWeight: 700, display: "block", marginBottom: 4 },
  pill:       { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99 },
};

function tsShort(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VolunteersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activity,    setActivity]    = useState<VolActivity[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [shareSlug,   setShareSlug]   = useState<string | null>(null);
  const [eventTitle,  setEventTitle]  = useState("");

  // Sponsor list (loaded when role=sponsor is selected)
  const [sponsors, setSponsors] = useState<{ id: string; name: string; tier: string }[]>([]);

  // Add form
  const [form,       setForm]       = useState({ email: "", name: "", password: "", role: "checkin", phone: "", sponsor_id: "" });
  const [isExisting, setIsExisting] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState("");

  // Copied portal URL
  const [copiedUrl,  setCopiedUrl]  = useState(false);

  // Per-card expansion state: key = assignment id
  const [expanded,   setExpanded]   = useState<Record<string, "role" | "shift" | "brief" | "pwd" | null>>({});

  // Edit buffers
  const [editRole,    setEditRole]    = useState("");
  const [editNotes,   setEditNotes]   = useState("");
  const [editShiftS,  setEditShiftS]  = useState("");
  const [editShiftE,  setEditShiftE]  = useState("");
  const [editPhone,   setEditPhone]   = useState("");
  const [editPwd,     setEditPwd]     = useState("");
  const [editSaving,  setEditSaving]  = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, evRes, actRes, spRes] = await Promise.all([
        fetch(`/api/admin/events/${eventId}/portal-users`),
        fetch(`/api/admin/events/${eventId}/overview`),
        fetch(`/api/admin/events/${eventId}/ops/volunteers`),
        fetch(`/api/admin/events/${eventId}/sponsors`),
      ]);
      if (usersRes.status === 401) { router.replace("/admin/login"); return; }
      if (usersRes.ok) {
        const d = await usersRes.json() as { assignments: Assignment[] };
        setAssignments(d.assignments ?? []);
      }
      if (evRes.ok) {
        const d = await evRes.json() as { event?: { share_slug?: string | null; title?: string } };
        setShareSlug(d.event?.share_slug ?? null);
        setEventTitle(d.event?.title ?? "");
      }
      if (actRes.ok) {
        const d = await actRes.json() as { volunteers?: VolActivity[] };
        setActivity(d.volunteers ?? []);
      }
      if (spRes?.ok) {
        const d = await spRes.json() as { sponsors?: { id: string; name: string; tier: string }[] };
        setSponsors(d.sponsors ?? []);
      }
    } finally { setLoading(false); }
  }, [eventId, router]);

  useEffect(() => { void load(); }, [load]);

  // ── Panel helpers ─────────────────────────────────────────────────────────

  function openPanel(aId: string, panel: "role" | "shift" | "brief" | "pwd", a: Assignment) {
    setExpanded(prev => ({ ...prev, [aId]: prev[aId] === panel ? null : panel }));
    setMsg("");
    if (panel === "role")  setEditRole(a.role);
    if (panel === "shift") {
      setEditNotes(a.notes ?? "");
      setEditShiftS(a.shift_start ? a.shift_start.slice(0, 16) : "");
      setEditShiftE(a.shift_end   ? a.shift_end.slice(0, 16)   : "");
      setEditPhone(a.event_portal_users.phone ?? "");
    }
    if (panel === "pwd")   setEditPwd("");
  }

  function closePanel(aId: string) {
    setExpanded(prev => ({ ...prev, [aId]: null }));
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function addVolunteer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg("");
    const body: Record<string, string> = { email: form.email.trim(), name: form.name.trim(), role: form.role };
    if (!isExisting) body.password = form.password;
    if (form.phone.trim())      body.phone      = form.phone.trim();
    if (form.sponsor_id.trim()) body.sponsor_id = form.sponsor_id.trim();
    const r = await fetch(`/api/admin/events/${eventId}/portal-users`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (r.ok) {
      setMsg("Added!");
      setForm({ email: "", name: "", password: "", role: "checkin", phone: "", sponsor_id: "" });
      setIsExisting(false);
      void load();
    } else setMsg(d.error ?? "Error");
    setSaving(false);
  }

  async function removeAssignment(aId: string) {
    if (!confirm("Remove this volunteer's access?")) return;
    await fetch(`/api/admin/events/${eventId}/portal-users?assignment_id=${aId}`, { method: "DELETE" });
    void load();
  }

  async function saveRole(aId: string) {
    setEditSaving(true); setMsg("");
    const r = await fetch(`/api/admin/events/${eventId}/portal-users`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignment_id: aId, new_role: editRole }),
    });
    const d = await r.json() as { ok?: boolean; error?: string; message?: string };
    if (r.ok) { setMsg(d.message === "No change" ? "Already that role." : "Role updated."); closePanel(aId); void load(); }
    else setMsg(d.error ?? "Error");
    setEditSaving(false);
  }

  async function saveShift(aId: string, userId: string) {
    setEditSaving(true); setMsg("");
    await Promise.all([
      fetch(`/api/admin/events/${eventId}/portal-users`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: aId, notes: editNotes || null, shift_start: editShiftS || null, shift_end: editShiftE || null }),
      }),
      editPhone !== undefined ? fetch(`/api/admin/events/${eventId}/portal-users`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal_user_id: userId, phone: editPhone || null }),
      }) : Promise.resolve(),
    ]);
    setMsg("Saved.");
    closePanel(aId);
    void load();
    setEditSaving(false);
  }

  async function resetPassword(aId: string, userId: string) {
    if (!editPwd || editPwd.length < 8) { setMsg("Min 8 characters."); return; }
    setEditSaving(true); setMsg("");
    const r = await fetch(`/api/admin/events/${eventId}/portal-users`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal_user_id: userId, password: editPwd }),
    });
    if (r.ok) { setMsg("Password reset."); closePanel(aId); }
    else { const d = await r.json() as { error?: string }; setMsg(d.error ?? "Error"); }
    setEditSaving(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const origin    = typeof window !== "undefined" ? window.location.origin : "";
  const portalUrl = shareSlug ? `${origin}/ops/${shareSlug}/login` : null;

  function actFor(email: string): VolActivity | undefined {
    return activity.find(a => a.email === email);
  }

  function buildBrief(a: Assignment): string {
    const u = a.event_portal_users;
    const role = OPS_ROLE_LABELS[a.role] ?? a.role;
    const shift = (a.shift_start || a.shift_end)
      ? `Shift: ${fmtTime(a.shift_start)} – ${fmtTime(a.shift_end)}`
      : "";
    const notes = a.notes ? `Notes: ${a.notes}` : "";
    const lines = [
      `Hi ${u.name},`,
      ``,
      `You're volunteering for ${eventTitle || "our event"} as: ${role}.`,
      shift,
      notes,
      ``,
      `Volunteer portal login:`,
      portalUrl ?? "(portal URL not set)",
      `Email: ${u.email}`,
      u.phone ? `Phone: ${u.phone}` : "",
    ].filter(l => l !== undefined && (l !== "" || lines?.indexOf(l) === 0)) as string[];
    return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
  }

  function buildAllBriefs(): string {
    return assignments.map(a => buildBrief(a)).join("\n\n---\n\n");
  }

  function copyText(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopiedUrl(false);
    if (key === "url") { setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href={`/admin/events/${eventId}/manage`} style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Event Hub</Link>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Volunteers</span>
        <span style={{ fontSize: 11, color: "#555" }}>{assignments.length} assigned</span>
        <div style={{ flex: 1 }} />
        {assignments.length > 0 && (
          <button
            onClick={() => { void navigator.clipboard.writeText(buildAllBriefs()); }}
            style={{ ...S.btn, color: "#e8620a", borderColor: "rgba(232,98,10,0.25)" }}
          >
            Copy All Briefs
          </button>
        )}
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 80px" }}>

        {msg && (
          <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 600, background: msg.toLowerCase().includes("error") || msg.toLowerCase().includes("min") ? "rgba(248,113,113,0.08)" : "rgba(74,222,128,0.08)", border: `1px solid ${msg.toLowerCase().includes("error") || msg.toLowerCase().includes("min") ? "rgba(248,113,113,0.2)" : "rgba(74,222,128,0.2)"}`, color: msg.toLowerCase().includes("error") || msg.toLowerCase().includes("min") ? "#f87171" : "#4ade80" }}>
            {msg}
          </div>
        )}

        {/* Portal login URL */}
        <div style={{ ...S.card, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "rgba(232,98,10,0.04)", border: "1px solid rgba(232,98,10,0.15)" }}>
          <span style={{ fontSize: 10, color: "#e8620a", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", flexShrink: 0 }}>Portal Login URL</span>
          {portalUrl ? (
            <>
              <code style={{ flex: 1, fontSize: 11, color: "#888", wordBreak: "break-all" as const }}>{portalUrl}</code>
              <button style={{ ...S.btn, flexShrink: 0, color: copiedUrl ? "#4ade80" : "#ccc" }} onClick={() => copyText(portalUrl, "url")}>
                {copiedUrl ? "✓ Copied" : "Copy"}
              </button>
            </>
          ) : (
            <span style={{ flex: 1, fontSize: 11, color: "#555", fontStyle: "italic" }}>
              {loading ? "Loading…" : "No share slug — set one in Event Hub → Overview"}
            </span>
          )}
        </div>

        {/* Add volunteer form */}
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 14 }}>Add Volunteer</div>
          <form onSubmit={e => void addVolunteer(e)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <label style={S.label}>Email</label>
                <input style={S.input} type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="volunteer@example.com" />
              </div>
              <div>
                <label style={S.label}>Full Name</label>
                <input style={S.input} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Display name" />
              </div>
              <div>
                <label style={S.label}>Phone</label>
                <input style={S.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: form.role === "sponsor" && sponsors.length > 0 ? "1fr 1fr 1fr auto" : "1fr 1fr auto", gap: 8, alignItems: "flex-end" }}>
              <div>
                <label style={S.label}>Role</label>
                <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" as const }} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, sponsor_id: "" }))}>
                  {Object.entries(OPS_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {form.role === "sponsor" && sponsors.length > 0 && (
                <div>
                  <label style={S.label}>Sponsor</label>
                  <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" as const }} value={form.sponsor_id} onChange={e => setForm(f => ({ ...f, sponsor_id: e.target.value }))}>
                    <option value="">— Select sponsor —</option>
                    {sponsors.map(s => <option key={s.id} value={s.id}>{s.name} ({s.tier})</option>)}
                  </select>
                </div>
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>Password</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555", cursor: "pointer" }}>
                    <input type="checkbox" checked={isExisting} onChange={e => setIsExisting(e.target.checked)} style={{ accentColor: "#e8620a" }} />
                    Existing user
                  </label>
                </div>
                {!isExisting && (
                  <input style={S.input} type="password" minLength={8} required={!isExisting} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 chars" />
                )}
              </div>
              <button type="submit" style={{ ...S.btnOrange, padding: "8px 18px" }} disabled={saving}>
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </div>

        {/* Volunteer list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#333", fontSize: 13 }}>Loading…</div>
        ) : assignments.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#444", fontSize: 13 }}>
            No volunteers assigned yet. Add one above.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {assignments.map(a => {
              const u       = a.event_portal_users;
              const act     = actFor(u.email);
              const panel   = expanded[a.id] ?? null;
              const hasShift = a.shift_start || a.shift_end;

              return (
                <div key={a.id} style={{ ...S.card, borderColor: panel ? "rgba(232,98,10,0.25)" : "rgba(255,255,255,0.07)" }}>

                  {/* ── Main row ─────────────────────────────────────── */}
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#e8620a", flexShrink: 0, marginTop: 2 }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Identity + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#eee" }}>{u.name}</span>
                        <span style={{ ...S.pill, background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.2)", color: "#e8620a" }}>
                          {OPS_ROLE_LABELS[a.role] ?? a.role}
                        </span>
                        {act && (
                          <span style={{ ...S.pill, background: act.is_active ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", color: act.is_active ? "#10b981" : "#555" }}>
                            {act.is_active ? "● Active" : "○ Offline"}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        {u.email}
                        {u.phone && <span style={{ marginLeft: 10, color: "#444" }}>📞 {u.phone}</span>}
                      </div>
                      {hasShift && (
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                          Shift: {fmtTime(a.shift_start)} {a.shift_start && a.shift_end ? "–" : ""} {fmtTime(a.shift_end)}
                        </div>
                      )}
                      {a.notes && (
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2, fontStyle: "italic" }}>{a.notes}</div>
                      )}
                      {act && act.total_scans > 0 && (
                        <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}>
                          {act.total_scans} scans{act.last_active ? ` · last active ${tsShort(act.last_active)}` : ""}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button style={{ ...S.btn, color: panel === "brief" ? "#e8620a" : "#888" }} onClick={() => openPanel(a.id, "brief", a)}>Brief</button>
                      <button style={{ ...S.btn, color: panel === "shift" ? "#e8620a" : "#888" }} onClick={() => openPanel(a.id, "shift", a)}>Edit</button>
                      <button style={{ ...S.btn, color: panel === "role"  ? "#e8620a" : "#888" }} onClick={() => openPanel(a.id, "role",  a)}>Role</button>
                      <button style={{ ...S.btn, color: panel === "pwd"   ? "#e8620a" : "#888" }} onClick={() => openPanel(a.id, "pwd",   a)}>PWD</button>
                      <button style={S.btnDanger} onClick={() => void removeAssignment(a.id)}>×</button>
                    </div>
                  </div>

                  {/* ── Brief panel ──────────────────────────────────── */}
                  {panel === "brief" && (() => {
                    const brief = buildBrief(a);
                    return (
                      <div style={{ marginTop: 12, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em" }}>Volunteer Brief</span>
                          <button style={{ ...S.btnOrange, padding: "4px 12px", fontSize: 11 }} onClick={() => void navigator.clipboard.writeText(brief)}>Copy</button>
                        </div>
                        <pre style={{ margin: 0, fontSize: 11, color: "#888", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6 }}>{brief}</pre>
                      </div>
                    );
                  })()}

                  {/* ── Shift / notes / phone edit panel ─────────────── */}
                  {panel === "shift" && (
                    <div style={{ marginTop: 12, background: "rgba(232,98,10,0.03)", border: "1px solid rgba(232,98,10,0.12)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Edit — {u.name}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={S.label}>Shift Start</label>
                          <input style={{ ...S.input, colorScheme: "dark" as const }} type="datetime-local" value={editShiftS} onChange={e => setEditShiftS(e.target.value)} />
                        </div>
                        <div>
                          <label style={S.label}>Shift End</label>
                          <input style={{ ...S.input, colorScheme: "dark" as const }} type="datetime-local" value={editShiftE} onChange={e => setEditShiftE(e.target.value)} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={S.label}>Phone</label>
                        <input style={S.input} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+91 98765 43210" />
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={S.label}>Notes</label>
                        <textarea style={{ ...S.input, minHeight: 52, resize: "vertical" as const }} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Team lead, arrives at 5am, knows first aid…" />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...S.btnOrange, fontSize: 11 }} onClick={() => void saveShift(a.id, u.id)} disabled={editSaving}>
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button style={S.btnGhost} onClick={() => closePanel(a.id)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* ── Role edit panel ───────────────────────────────── */}
                  {panel === "role" && (
                    <div style={{ marginTop: 12, background: "rgba(232,98,10,0.03)", border: "1px solid rgba(232,98,10,0.12)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Change Role — {u.name}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <label style={S.label}>New Role</label>
                          <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" as const }} value={editRole} onChange={e => setEditRole(e.target.value)}>
                            {Object.entries(OPS_ROLE_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}{k === a.role ? " (current)" : ""}</option>
                            ))}
                          </select>
                        </div>
                        <button style={{ ...S.btnOrange, fontSize: 11 }} onClick={() => void saveRole(a.id)} disabled={editSaving || editRole === a.role}>
                          {editSaving ? "Saving…" : "Save Role"}
                        </button>
                        <button style={S.btnGhost} onClick={() => closePanel(a.id)}>Cancel</button>
                      </div>
                      <div style={{ fontSize: 10, color: "#444", marginTop: 8 }}>Volunteer must log out and back in for role change to take effect.</div>
                    </div>
                  )}

                  {/* ── Password reset panel ──────────────────────────── */}
                  {panel === "pwd" && (
                    <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 200px" }}>
                        <label style={S.label}>New Password (min 8 chars)</label>
                        <input style={S.input} type="password" minLength={8} value={editPwd} onChange={e => setEditPwd(e.target.value)} placeholder="New password" autoFocus />
                      </div>
                      <button style={{ ...S.btnOrange, fontSize: 11 }} onClick={() => void resetPassword(a.id, u.id)} disabled={editSaving}>
                        {editSaving ? "Saving…" : "Set Password"}
                      </button>
                      <button style={S.btnGhost} onClick={() => closePanel(a.id)}>Cancel</button>
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
