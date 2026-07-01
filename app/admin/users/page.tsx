"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, Button, Input, Alert, Badge, EmptyState, StatCard } from "@/components/ui/ds";

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
  const [authed,    setAuthed]    = useState(true);
  const [users,     setUsers]     = useState<AppUser[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<MemberFilter>("all");
  const [goalFilter, setGoalFilter] = useState("all");
  const [toggling,  setToggling]  = useState<Record<string, boolean>>({});

  async function login(password: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setError("Incorrect password."); return; }
      setAuthed(true);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setUsers(data.users);
      setStats(data.stats);
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function toggleActive(email: string, newState: boolean) {
    setToggling((t) => ({ ...t, [email]: true }));
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filter, goalFilter, search]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visible    = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "320px" }}>
          <Card>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Users</div>
            <Input type="password" placeholder="Admin password" value={pw}
              onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login(pw)}
              style={{ marginBottom: "0.75rem" }} />
            {error && <Alert variant="error" style={{ marginBottom: "0.75rem" }}>{error}</Alert>}
            <Button fullWidth loading={loading} onClick={() => login(pw)}>Access</Button>
            <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to admin</Link>
          </Card>
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
        <Button size="xs" variant="ghost" onClick={() => load()}>Refresh</Button>
      </header>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <StatCard label="Total Users"       value={stats.total} />
            <StatCard label="Active Members"    value={stats.activeMembers} color="#4ade80" />
            <StatCard label="Strava Connected"  value={stats.withStrava} color="#fc4c02" />
            <StatCard label="Sessions Attended" value={stats.totalSessions} color="#e8620a" />
            <StatCard label="Deactivated"       value={deactivatedCount} color="#f09595" />
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

          {visible.length === 0 ? (
            <EmptyState title="No users found." />
          ) : visible.map((u) => {
            const isDeactivated = u.is_active === false;
            const isPending     = toggling[u.email];
            return (
              <div key={u.email} style={{ display: "grid", gridTemplateColumns: "1.6fr 1.6fr 100px 110px 80px 80px 80px 80px 110px 100px", gap: "0", padding: "0.85rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.82rem", alignItems: "center", minWidth: "1000px", opacity: isDeactivated ? 0.55 : 1 }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                    {u.first_name} {u.last_name}
                    {isDeactivated && <Badge color="red" size="sm">DISABLED</Badge>}
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
                      <Badge color="green" size="sm">{PLAN_LABELS[u.membership ?? ""] ?? u.membership}</Badge>
                      <div style={{ fontSize: "10px", color: "#555", marginTop: "3px" }}>until {fmtDate(u.expires_at ?? "")}</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: "10px", color: "#555" }}>No membership</span>
                  )}
                </div>
                <div>
                  <Button size="xs" variant={isDeactivated ? "ghost" : "danger"} loading={isPending}
                    onClick={() => toggleActive(u.email, !isDeactivated)}>
                    {isDeactivated ? "Enable" : "Disable"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 0" }}>
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Previous</Button>
            <span style={{ fontSize: 13, color: "#444" }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} users
            </span>
            <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>Next →</Button>
          </div>
        )}

      </div>
    </div>
  );
}
