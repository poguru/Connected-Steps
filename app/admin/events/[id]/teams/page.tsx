"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMemberParticipant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  distance_category: string | null;
  registration_code: string | null;
  checked_in: boolean;
  bib_collected: boolean;
  tshirt_issued: boolean;
  medal_issued: boolean;
  bib_number: string | null;
}

interface TeamMember {
  id: string;
  role: "captain" | "member";
  event_participants: TeamMemberParticipant | null;
}

interface Team {
  id: string;
  company_name: string;
  team_name: string;
  hr_contact_name: string | null;
  hr_contact_email: string | null;
  notes: string | null;
  members_count: number;
  checked_in: number;
  finishers: number;
  score: number;
  event_team_members: TeamMember[];
}

// ── Style tokens ──────────────────────────────────────────────────────────────

const S = {
  input: {
    width: "100%", padding: "8px 10px",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 7, color: "#fff", fontFamily: "inherit",
    fontSize: 13, outline: "none", boxSizing: "border-box" as const,
  } as React.CSSProperties,
  btn: (variant: "primary" | "ghost" | "danger" = "ghost") => ({
    padding: "7px 14px", border: "none", borderRadius: 7,
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    background: variant === "primary" ? "#e8620a" : variant === "danger" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)",
    color: variant === "primary" ? "#fff" : variant === "danger" ? "#f87171" : "#aaa",
  } as React.CSSProperties),
  card: {
    background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 12, padding: "16px 18px",
  } as React.CSSProperties,
  label: {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
    letterSpacing: "0.08em", color: "#555", display: "block", marginBottom: 5,
  } as React.CSSProperties,
};

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function StatusDot({ on, color }: { on: boolean; color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: on ? color : "#2a2a2a", marginRight: 3,
    }} />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CorporateTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);

  const [teams,    setTeams]   = useState<Team[]>([]);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast,    setToast]   = useState("");

  // Create team form
  const [newTeam, setNewTeam] = useState({ company_name: "", team_name: "", hr_contact_name: "", hr_contact_email: "" });
  const [creating, setCreating] = useState(false);

  // Assign member form (keyed by team_id)
  const [assignCode,    setAssignCode]    = useState("");
  const [assignRole,    setAssignRole]    = useState<"captain" | "member">("member");
  const [assigningTeam, setAssigningTeam] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  async function loadTeams() {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/teams`);
      const data = await res.json() as { teams?: Team[]; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to load teams"); return; }
      setTeams(data.teams ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadTeams(); /* eslint-disable-next-line */ }, [eventId]);

  async function createTeam() {
    if (!newTeam.company_name.trim() || !newTeam.team_name.trim()) {
      showToast("Company name and team name are required"); return;
    }
    setCreating(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/teams`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTeam),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { showToast(data.error ?? "Failed to create team"); return; }
      setNewTeam({ company_name: "", team_name: "", hr_contact_name: "", hr_contact_email: "" });
      showToast("Team created");
      await loadTeams();
    } finally { setCreating(false); }
  }

  async function deleteTeam(id: string, name: string) {
    if (!confirm(`Delete team "${name}" and remove all member assignments?`)) return;
    const res = await fetch(`/api/admin/events/${eventId}/teams`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    if (res.ok) { showToast("Team deleted"); await loadTeams(); }
    else { const d = await res.json() as { error?: string }; showToast(d.error ?? "Failed"); }
  }

  async function assignMember(teamId: string) {
    if (!assignCode.trim()) { showToast("Enter a registration code"); return; }
    setAssigningTeam(teamId);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/teams`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", team_id: teamId, registration_code: assignCode.trim().toUpperCase(), role: assignRole }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { showToast(data.error ?? "Failed to assign"); return; }
      setAssignCode(""); showToast("Member assigned");
      await loadTeams();
    } finally { setAssigningTeam(null); }
  }

  async function removeMember(teamId: string, participantId: string) {
    const res = await fetch(`/api/admin/events/${eventId}/teams`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", team_id: teamId, participant_id: participantId }),
    });
    if (res.ok) { showToast("Member removed"); await loadTeams(); }
    else { const d = await res.json() as { error?: string }; showToast(d.error ?? "Failed"); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1a1a1a", padding: "0 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, height: 56 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 18, textDecoration: "none" }}>←</Link>
          <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Corporate Wellness · Teams</div>
          <a
            href={`/api/admin/events/${eventId}/teams/export`}
            style={{ ...S.btn("primary"), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            📥 HR Export CSV
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 60px" }}>
        {error && <div style={{ color: "#f87171", marginBottom: 16, fontSize: 13 }}>{error}</div>}

        {/* Create team */}
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#e8620a", marginBottom: 14 }}>Add Corporate Team</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>Company Name *</label>
              <input style={S.input} value={newTeam.company_name} onChange={e => setNewTeam(p => ({ ...p, company_name: e.target.value }))} placeholder="Acme Corp" />
            </div>
            <div>
              <label style={S.label}>Team Name *</label>
              <input style={S.input} value={newTeam.team_name} onChange={e => setNewTeam(p => ({ ...p, team_name: e.target.value }))} placeholder="Alpha Runners" />
            </div>
            <div>
              <label style={S.label}>HR Contact Name</label>
              <input style={S.input} value={newTeam.hr_contact_name} onChange={e => setNewTeam(p => ({ ...p, hr_contact_name: e.target.value }))} placeholder="Jane Doe" />
            </div>
            <div>
              <label style={S.label}>HR Contact Email</label>
              <input style={S.input} value={newTeam.hr_contact_email} onChange={e => setNewTeam(p => ({ ...p, hr_contact_email: e.target.value }))} placeholder="hr@acme.com" type="email" />
            </div>
          </div>
          <button style={S.btn("primary")} onClick={createTeam} disabled={creating}>
            {creating ? "Creating…" : "+ Create Team"}
          </button>
        </div>

        {/* Leaderboard header */}
        {!loading && teams.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#555", marginBottom: 10 }}>
            Leaderboard — {teams.length} {teams.length === 1 ? "Team" : "Teams"}
          </div>
        )}

        {loading && <div style={{ color: "#555", fontSize: 13, padding: "20px 0" }}>Loading teams…</div>}

        {/* Team cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {teams.map((team, idx) => {
            const isOpen = expanded === team.id;
            return (
              <div key={team.id} style={{ ...S.card, borderColor: idx < 3 ? "rgba(232,98,10,0.2)" : "#1a1a1a" }}>
                {/* Team header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: idx < 3 ? 22 : 14, fontWeight: 700, color: "#888", minWidth: 36, textAlign: "center" }}>
                    {medal(idx + 1)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{team.team_name}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {team.company_name}
                      {team.hr_contact_email && <span> · <a href={`mailto:${team.hr_contact_email}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{team.hr_contact_email}</a></span>}
                    </div>
                  </div>

                  {/* Stats pills */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "#888" }}>
                      👥 {team.members_count}
                    </span>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                      ✅ {team.checked_in}
                    </span>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                      🏅 {team.finishers}
                    </span>
                    <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: "rgba(232,98,10,0.12)", color: "#e8620a", fontWeight: 700 }}>
                      {team.score} pts
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={S.btn()} onClick={() => setExpanded(isOpen ? null : team.id)}>
                      {isOpen ? "▲ Hide" : "▼ Members"}
                    </button>
                    <button style={S.btn("danger")} onClick={() => deleteTeam(team.id, team.team_name)}>✕</button>
                  </div>
                </div>

                {/* Expanded: member list + assign form */}
                {isOpen && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1a1a1a" }}>
                    {/* Assign member */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <label style={S.label}>Registration Code</label>
                        <input
                          style={S.input}
                          value={assignCode}
                          onChange={e => setAssignCode(e.target.value)}
                          placeholder="e.g. CS-123456"
                          onKeyDown={e => { if (e.key === "Enter") assignMember(team.id); }}
                        />
                      </div>
                      <div>
                        <label style={S.label}>Role</label>
                        <select
                          style={{ ...S.input, width: "auto" }}
                          value={assignRole}
                          onChange={e => setAssignRole(e.target.value as "captain" | "member")}
                        >
                          <option value="captain">Captain</option>
                          <option value="member">Member</option>
                        </select>
                      </div>
                      <button
                        style={S.btn("primary")}
                        onClick={() => assignMember(team.id)}
                        disabled={assigningTeam === team.id}
                      >
                        {assigningTeam === team.id ? "Assigning…" : "+ Assign"}
                      </button>
                    </div>

                    {/* Members table */}
                    {team.event_team_members.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#444", padding: "10px 0" }}>No members yet — assign runners by registration code.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #1a1a1a" }}>
                              {["Role", "Name", "Code", "Distance", "Check-in", "BIB", "T-Shirt", "Medal", ""].map(h => (
                                <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "#555", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {team.event_team_members.map(m => {
                              const p = m.event_participants;
                              if (!p) return null;
                              return (
                                <tr key={m.id} style={{ borderBottom: "1px solid #111" }}>
                                  <td style={{ padding: "8px", color: m.role === "captain" ? "#e8620a" : "#555", fontWeight: m.role === "captain" ? 700 : 400 }}>
                                    {m.role === "captain" ? "⭐ Captain" : "Member"}
                                  </td>
                                  <td style={{ padding: "8px", color: "#fff" }}>{p.first_name} {p.last_name}</td>
                                  <td style={{ padding: "8px", color: "#60a5fa", fontFamily: "monospace", fontSize: 11 }}>{p.registration_code}</td>
                                  <td style={{ padding: "8px", color: "#888" }}>{p.distance_category ?? "—"}</td>
                                  <td style={{ padding: "8px" }}>
                                    <StatusDot on={p.checked_in} color="#10b981" />
                                  </td>
                                  <td style={{ padding: "8px" }}>
                                    <StatusDot on={p.bib_collected} color="#60a5fa" />
                                    {p.bib_number && <span style={{ color: "#555", fontSize: 10 }}>{p.bib_number}</span>}
                                  </td>
                                  <td style={{ padding: "8px" }}><StatusDot on={p.tshirt_issued} color="#f59e0b" /></td>
                                  <td style={{ padding: "8px" }}><StatusDot on={p.medal_issued} color="#fbbf24" /></td>
                                  <td style={{ padding: "8px" }}>
                                    <button
                                      style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 5px" }}
                                      onClick={() => removeMember(team.id, p.id)}
                                      title="Remove from team"
                                    >×</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && teams.length === 0 && (
            <div style={{ color: "#444", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              No corporate teams yet. Create one above to get started.
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1a1a1a", border: "1px solid #333", color: "#fff",
          padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          zIndex: 9999, pointerEvents: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        }}>
          {toast}
        </div>
      )}

      {/* Mobile styles */}
      <style>{`
        @media (max-width: 640px) {
          .team-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
