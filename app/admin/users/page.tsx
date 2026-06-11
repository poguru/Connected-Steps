"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

const GOAL_LABELS: Record<string, string> = {
  "5k":  "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "Monthly", quarterly: "3 Months", biannual: "6 Months", annual: "12 Months",
};

type MemberFilter = "all" | "active" | "inactive" | "deactivated";

interface AppUser {
  email:          string;
  first_name:     string;
  last_name:      string;
  phone:          string;
  goal:           string;
  location:       string;
  created_at:     string;
  is_active:      boolean;
  membership:     string | null;
  expires_at:     string | null;
  isActiveMember: boolean;
  total_points:   number;
  month_points:   number;
  total_runs:     number;
  total_km:       number;
  session_count:  number;
}

interface Stats {
  total: number; activeMembers: number; withStrava: number; totalSessions: number;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminUsersPage() {
  const [pw,        setPw]        = useState("");
  const [authed,    setAuthed]    = useState(false);
  const [users,     setUsers]     = useState<AppUser[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<MemberFilter>("all");
  const [goalFilter, setGoalFilter] = useState("all");
  const [toggling,  setToggling]  = useState<Record<string, boolean>>({});

  const load = useCallback(async (password: string) => {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/admin/users", { headers: { "x-admin-password": password } });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setUsers(data.users);
      setStats(data.stats);
      localStorage.setItem("cs_admin_pw", password);
      setAuthed(true);
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const s = localStorage.getItem("cs_admin_pw"); if (s) load(s); }, [load]);

  async function toggleActive(email: string, newState: boolean) {
    const storedPw = localStorage.getItem("cs_admin_pw") ?? pw;
    setToggling((t) => ({ ...t, [email]: true }));
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": storedPw },
        body: JSON.stringify({ email, is_active: newState }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.email === email ? { ...u, is_active: newState } : u))
        );
      }
    } finally {
      setToggling((t) => ({ ...t, [email]: false }));
    }
  }

  const filtered = useMemo(() => {
    let list = users;
    if (filter === "active")      list = list.filter((u) => u.isActiveMember);
    if (filter === "inactive")    list = list.filter((u) => !u.isActiveMember && u.is_active !== false);
    if (filter === "deactivated") list = list.filter((u) => u.is_active === false);
    if (goalFilter !== "all")     list = list.filter((u) => u.goal === goalFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) || u.phone.includes(q) ||
        u.location.toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, filter, goalFilter, search]);

  const deactivatedCount = useMemo(() => users.filter((u) => u.is_active === false).length, [users]);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "2rem", width: "320px" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Users</div>
          <input type="password" placeholder="Admin password" value={pw}
            onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pw)}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem", fontFamily: "inherit" }} />
          {error && <div style={{ fontSize: "0.8rem", color: "#f09595", marginBottom: "0.75rem" }}>{error}</div>}
          <button onClick={() => load(pw)} disabled={loading}
            style={{ width: "100%", padding: "10px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {loading ? "Loading…" : "Access"}
          </button>
          <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to admin</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin"><Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" /></Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Users</span>
        </div>
        <button onClick={() => load(pw)} style={{ fontSize: "0.75rem", color: "#888", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}>Refresh</button>
      </header>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            {[
              { label: "Total Users",      value: stats.total,          color: "#fff" },
              { label: "Active Members",   value: stats.activeMembers,  color: "#4ade80" },
              { label: "Strava Connected", value: stats.withStrava,     color: "#fc4c02" },
              { label: "Sessions Attended",value: stats.totalSessions,  color: "#e8620a" },
              { label: "Deactivated",      value: deactivatedCount,     color: "#f09595" },
            ].map((s) => (
              <div key={s.label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1.25rem" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "4px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", padding: "3px" }}>
            {([
              { key: "all",         label: "All" },
              { key: "active",      label: "Members" },
              { key: "inactive",    label: "Non-members" },
              { key: "deactivated", label: "Deactivated" },
            ] as { key: MemberFilter; label: string }[]).map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: "5px 14px", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", border: "none",
                  background: filter === f.key ? (f.key === "deactivated" ? "#7f1d1d" : "#e8620a") : "transparent",
                  color: filter === f.key ? "#fff" : "#888", transition: "all 0.15s" }}>
                {f.label}
              </button>
            ))}
          </div>
          <select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)}
            style={{ padding: "7px 12px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", cursor: "pointer", colorScheme: "dark" }}>
            <option value="all" style={{ background: "#1a1a1a", color: "#fff" }}>All Goals</option>
            {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k} style={{ background: "#1a1a1a", color: "#fff" }}>{v}</option>)}
          </select>
          <input placeholder="Search name, email, phone, location…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: "220px", padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#fff", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }} />
          <div style={{ fontSize: "0.8rem", color: "#555" }}>{filtered.length} user{filtered.length !== 1 ? "s" : ""}</div>
        </div>

        {/* Table */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.6fr 100px 110px 80px 80px 80px 80px 110px 100px", gap: "0", padding: "0.75rem 1.25rem", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: "1000px" }}>
            <div>Member</div><div>Email</div><div>Goal</div><div>Location</div>
            <div>Sessions</div><div>Runs</div><div>Km</div><div>Points</div><div>Membership</div><div>Account</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No users found.</div>
          ) : filtered.map((u) => {
            const isDeactivated = u.is_active === false;
            const isPending     = toggling[u.email];
            return (
              <div key={u.email} style={{ display: "grid", gridTemplateColumns: "1.6fr 1.6fr 100px 110px 80px 80px 80px 80px 110px 100px", gap: "0", padding: "0.85rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.82rem", alignItems: "center", minWidth: "1000px", opacity: isDeactivated ? 0.55 : 1 }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                    {u.first_name} {u.last_name}
                    {isDeactivated && <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "10px", background: "rgba(240,149,149,0.12)", color: "#f09595", letterSpacing: "0.05em" }}>DISABLED</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>📞 {u.phone || "—"} · Joined {fmtDate(u.created_at)}</div>
                </div>
                <div style={{ color: "#888", wordBreak: "break-all", fontSize: "0.78rem" }}>{u.email}</div>
                <div style={{ color: "#888" }}>{GOAL_LABELS[u.goal] ?? (u.goal || "—")}</div>
                <div style={{ color: "#888", fontSize: "0.78rem" }}>📍 {u.location || "—"}</div>
                <div style={{ color: "#e8620a", fontWeight: 600 }}>{u.session_count}</div>
                <div style={{ color: "#888" }}>{u.total_runs}</div>
                <div style={{ color: "#888" }}>{u.total_km.toFixed(0)}</div>
                <div style={{ color: "#888" }}>{u.total_points}</div>
                <div>
                  {u.isActiveMember ? (
                    <div>
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                        {PLAN_LABELS[u.membership ?? ""] ?? u.membership}
                      </span>
                      <div style={{ fontSize: "10px", color: "#555", marginTop: "3px" }}>until {fmtDate(u.expires_at ?? "")}</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: "10px", color: "#555" }}>No membership</span>
                  )}
                </div>
                <div>
                  <button
                    disabled={isPending}
                    onClick={() => toggleActive(u.email, !isDeactivated)}
                    style={{
                      fontSize: "10px", fontWeight: 600, padding: "4px 10px", borderRadius: "5px", cursor: isPending ? "default" : "pointer",
                      border: "none", fontFamily: "inherit", opacity: isPending ? 0.5 : 1, transition: "opacity 0.15s",
                      background: isDeactivated ? "rgba(74,222,128,0.12)" : "rgba(240,149,149,0.12)",
                      color:      isDeactivated ? "#4ade80"               : "#f09595",
                    }}>
                    {isPending ? "…" : isDeactivated ? "Enable" : "Disable"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
