"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCoach } from "./layout";

interface Athlete {
  email: string;
  first_name: string;
  last_name: string;
  is_active_member: boolean;
  membership_plan: string | null;
  training_plan: string | null;
  attended_count: number;
  attendance_pct: number;
  streak: number;
  last_session_date: string | null;
  is_at_risk: boolean;
  is_low_att: boolean;
  has_plan: boolean;
}

interface Stats {
  total: number;
  active_members: number;
  at_risk: number;
  low_att: number;
  no_plan: number;
}

function fmtDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#555", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

export default function CoachDashboard() {
  const coach = useCoach();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    fetch("/api/coach/athletes")
      .then(r => r.json())
      .then(d => { setAthletes(d.athletes ?? []); setStats(d.stats ?? null); })
      .catch(() => setError("Failed to load athletes."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = athletes.filter(a => {
    const q = search.toLowerCase();
    return !q || `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || a.email.includes(q);
  });

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#fff", margin: 0 }}>
          {coach ? `Welcome, ${coach.name.split(" ")[0]}` : "Coach Dashboard"}
        </h1>
        <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Your assigned athletes</p>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
          <StatCard label="Athletes"      value={stats.total}          color="#fff" />
          <StatCard label="Active"        value={stats.active_members} color="#4ade80" />
          <StatCard label="At Risk"       value={stats.at_risk}        color="#f87171" />
          <StatCard label="Low Att."      value={stats.low_att}        color="#facc15" />
          <StatCard label="No Plan"       value={stats.no_plan}        color="#fb923c" />
        </div>
      )}

      {/* Search */}
      <input
        type="text" placeholder="Search athletes…" value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 8, padding: "10px 14px", color: "#f0f0f0", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: "1rem", fontFamily: "inherit" }}
      />

      {/* Athletes list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#f87171" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>
          {search ? "No athletes match your search." : "No athletes assigned yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(a => (
            <div key={a.email} style={{ background: "#111", border: `1px solid ${a.is_at_risk ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>

              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8620a22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#e8620a", flexShrink: 0 }}>
                {a.first_name.charAt(0).toUpperCase()}
              </div>

              {/* Name + email */}
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0" }}>{a.first_name} {a.last_name}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{a.email}</div>
              </div>

              {/* Badges */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {a.is_active_member ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", background: "#4ade8015", border: "1px solid #4ade8030", padding: "2px 7px", borderRadius: 999 }}>ACTIVE</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171", background: "#f8717115", border: "1px solid #f8717130", padding: "2px 7px", borderRadius: 999 }}>INACTIVE</span>
                )}
                {a.is_at_risk && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fb923c", background: "#fb923c15", border: "1px solid #fb923c30", padding: "2px 7px", borderRadius: 999 }}>AT RISK</span>
                )}
                {!a.has_plan && a.is_active_member && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#facc15", background: "#facc1515", border: "1px solid #facc1530", padding: "2px 7px", borderRadius: 999 }}>NO PLAN</span>
                )}
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#666", flexShrink: 0 }}>
                <span title="Sessions attended">🏃 {a.attended_count}</span>
                <span title="Attendance %">📊 {a.attendance_pct}%</span>
                <span title="Streak">🔥 {a.streak}</span>
                <span title="Last session">📅 {fmtDate(a.last_session_date)}</span>
              </div>

              {/* Actions */}
              <Link href={`/coach/athletes/${encodeURIComponent(a.email)}`}
                style={{ fontSize: 12, color: "#e8620a", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}>
                View →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
