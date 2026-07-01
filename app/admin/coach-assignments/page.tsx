"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, Button, Label, Alert, StatCard, Avatar, Spinner } from "@/components/ui/ds";

interface Coach {
  id:             string;
  name:           string;
  email:          string;
  specialization: string | null;
  is_admin:       boolean;
}

interface User {
  email:      string;
  first_name: string;
  last_name:  string;
}

interface Assignment {
  id:          string;
  user_email:  string;
  coach_id:    string;
  assigned_at: string;
  coaches:     { id: string; name: string; specialization: string | null } | null;
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function CoachAssignmentsPage() {
  const [assignments,  setAssignments] = useState<Assignment[]>([]);
  const [coaches,      setCoaches]     = useState<Coach[]>([]);
  const [users,        setUsers]       = useState<User[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [msg,          setMsg]         = useState("");

  // New assignment form
  const [selUser,   setSelUser]   = useState("");
  const [selCoach,  setSelCoach]  = useState("");
  const [assigning, setAssigning] = useState(false);

  // Search/filter
  const [search, setSearch] = useState("");

  // ── Data ──────────────────────────────────────────────────────────────────
  // Auth is handled by AdminLayout — cs_admin_session cookie sent automatically.

  function load() {
    setLoading(true);
    fetch("/api/admin/coach-assignments")
      .then(r => r.json())
      .then(d => {
        setAssignments(d.assignments ?? []);
        setCoaches(d.coaches ?? []);
        setUsers(d.users ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Assign ────────────────────────────────────────────────────────────────

  async function assign() {
    if (!selUser || !selCoach) { setMsg("Select a user and a coach."); return; }
    setAssigning(true);
    setMsg("");
    const res = await fetch("/api/admin/coach-assignments", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_email: selUser, coach_id: selCoach }),
    });
    const data = await res.json();
    setAssigning(false);
    if (res.ok) {
      setMsg("Coach assigned.");
      setSelUser(""); setSelCoach("");
      load();
    } else {
      setMsg("Error: " + (data.error ?? "Unknown"));
    }
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  async function remove(user_email: string, coach_id: string, coachName: string) {
    if (!confirm(`Remove ${coachName} from ${user_email}?`)) return;
    setMsg("");
    const res = await fetch("/api/admin/coach-assignments", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_email, coach_id }),
    });
    if (res.ok) { setMsg("Assignment removed."); load(); }
    else { const d = await res.json(); setMsg("Error: " + (d.error ?? "Unknown")); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const byUser = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!map.has(a.user_email)) map.set(a.user_email, []);
      map.get(a.user_email)!.push(a);
    }
    return map;
  }, [assignments]);

  const unassignedUsers = useMemo(() => {
    return users.filter(u => !byUser.has(u.email));
  }, [users, byUser]);

  const allUserRows = useMemo(() => {
    const q = search.toLowerCase();
    const sorted = [
      ...users.filter(u =>  byUser.has(u.email)),
      ...users.filter(u => !byUser.has(u.email)),
    ];
    if (!q) return sorted;
    return sorted.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q)
    );
  }, [users, byUser, search]);

  const assignableCoaches = useMemo(() => coaches.filter(c => !c.is_admin), [coaches]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const input:  React.CSSProperties = { width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", fontSize: "0.9rem", color: "#fff", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const select: React.CSSProperties = { ...input, cursor: "pointer" };

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#fff", padding: "2rem 1.5rem" }}>

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Admin</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Coach Assignments</div>
          <div style={{ fontSize: "0.82rem", color: "#888", marginTop: 4 }}>
            Assign coaches to users. Users will only see Admin + their assigned coach in the Messages screen.
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 12, marginBottom: "1.75rem", flexWrap: "wrap" }}>
          <StatCard label="Total Users"    value={users.length} />
          <StatCard label="Assigned"       value={byUser.size} color="#4ade80" />
          <StatCard label="Unassigned"     value={unassignedUsers.length} color={unassignedUsers.length > 0 ? "#fbbf24" : "#555"} />
          <StatCard label="Active Coaches" value={assignableCoaches.length} />
        </div>

        {/* Assign form */}
        <Card style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "1rem" }}>New Assignment</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
            <div>
              <Label>User</Label>
              <select value={selUser} onChange={e => setSelUser(e.target.value)} style={select}>
                <option value="">Select user…</option>
                {users.map(u => (<option key={u.email} value={u.email}>{u.first_name} {u.last_name} ({u.email})</option>))}
              </select>
            </div>
            <div>
              <Label>Coach</Label>
              <select value={selCoach} onChange={e => setSelCoach(e.target.value)} style={select}>
                <option value="">Select coach…</option>
                {assignableCoaches.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <Button loading={assigning} disabled={!selUser || !selCoach} onClick={assign}>Assign →</Button>
          </div>
          {msg && <Alert variant={msg.startsWith("Error") ? "error" : "success"} style={{ marginTop: "0.75rem" }}>{msg}</Alert>}
        </Card>

        {/* Search */}
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder="Search users by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...input, maxWidth: 380 }}
          />
        </div>

        {/* User table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem 0" }}><Spinner /></div>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["User", "Assigned Coach", "Assigned On", ""].map(h => (
                    <th key={h} style={{ padding: "0.75rem 1rem", fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, textAlign: "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allUserRows.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "#888", fontSize: "0.85rem" }}>No users found.</td></tr>
                ) : allUserRows.map((user, i) => {
                  const userAssignments = byUser.get(user.email) ?? [];
                  const fullName = `${user.first_name} ${user.last_name}`.trim() || user.email;

                  if (userAssignments.length === 0) {
                    return (
                      <tr key={user.email} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none", opacity: 0.55 }}>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar name={fullName} size={32} />
                            <div>
                              <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>{fullName}</div>
                              <div style={{ fontSize: "0.72rem", color: "#888" }}>{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span style={{ fontSize: "0.78rem", color: "#888", fontStyle: "italic" }}>No coach assigned</span>
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>—</td>
                        <td style={{ padding: "0.875rem 1rem" }} />
                      </tr>
                    );
                  }

                  return userAssignments.map((a, ai) => (
                    <tr key={a.id} style={{ borderTop: (i > 0 || ai > 0) ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      {ai === 0 ? (
                        <td style={{ padding: "0.875rem 1rem" }} rowSpan={userAssignments.length}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar name={fullName} size={32} />
                            <div>
                              <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>{fullName}</div>
                              <div style={{ fontSize: "0.72rem", color: "#888" }}>{user.email}</div>
                            </div>
                          </div>
                        </td>
                      ) : null}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar name={a.coaches?.name ?? "?"} size={28} />
                          <div>
                            <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{a.coaches?.name ?? "Unknown"}</div>
                            {a.coaches?.specialization && (
                              <div style={{ fontSize: "0.7rem", color: "#888" }}>{a.coaches.specialization}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "0.875rem 1rem", fontSize: "0.78rem", color: "#888" }}>
                        {fmtDate(a.assigned_at)}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", textAlign: "right" }}>
                        <Button size="xs" variant="danger" onClick={() => remove(a.user_email, a.coach_id, a.coaches?.name ?? "coach")}>Remove</Button>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </Card>
        )}

        <div style={{ marginTop: "1.25rem", fontSize: "0.75rem", color: "#555", lineHeight: 1.6 }}>
          <strong style={{ color: "#888" }}>Note:</strong> Admin and Training Team coaches are always visible to all users and do not need to be assigned.
          Only non-admin coaches appear in this assignment list.
        </div>
      </div>
    </div>
  );
}
