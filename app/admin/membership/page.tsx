"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";

const PLAN_LABELS: Record<string, string> = {
  monthly:   "Monthly",
  quarterly: "3 Months",
  biannual:  "6 Months",
  annual:    "12 Months",
};

type Filter = "all" | "active" | "expired" | "expiring";

interface Member {
  user_email:          string;
  first_name:          string;
  last_name:           string;
  phone:               string;
  location:            string;
  plan:                string;
  status:              string;
  amount_paid:         number;
  started_at:          string;
  expires_at:          string;
  razorpay_payment_id: string;
  isActive:            boolean;
  expiringSoon:        boolean;
}

interface Stats {
  total:        number;
  active:       number;
  expired:      number;
  expiringSoon: number;
  revenue:      number;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function AdminMembershipPage() {
  const [pw,       setPw]       = useState("");
  const [authed,   setAuthed]   = useState(false);
  const [members,  setMembers]  = useState<Member[]>([]);
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState<Filter>("all");
  const [search,   setSearch]   = useState("");
  const [error,    setError]    = useState("");

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

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/memberships");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
      setMembers(data.memberships);
      setStats(data.stats);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (authed) load(); }, [authed]);

  const filtered = useMemo(() => {
    let list = members;
    if (filter === "active")   list = list.filter((m) => m.isActive && !m.expiringSoon);
    if (filter === "expired")  list = list.filter((m) => !m.isActive);
    if (filter === "expiring") list = list.filter((m) => m.expiringSoon);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
        m.user_email.toLowerCase().includes(q) ||
        m.phone.includes(q)
      );
    }
    return list;
  }, [members, filter, search]);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "2rem", width: "320px" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Memberships</div>
          <input
            type="password"
            placeholder="Admin password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login(pw)}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem", fontFamily: "inherit" }}
          />
          {error && <div style={{ fontSize: "0.8rem", color: "#f09595", marginBottom: "0.75rem" }}>{error}</div>}
          <button
            onClick={() => login(pw)}
            disabled={loading}
            style={{ width: "100%", padding: "10px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            {loading ? "Loading…" : "Access"}
          </button>
          <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to admin</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>

      {/* Header */}
      <header style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
          </Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Memberships</span>
        </div>
        <button
          onClick={() => load()}
          style={{ fontSize: "0.75rem", color: "#888", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}
        >
          Refresh
        </button>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Stats row */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            {[
              { label: "Total Members",   value: stats.total,                                          color: "#fff" },
              { label: "Active",          value: stats.active,                                         color: "#4ade80" },
              { label: "Expired",         value: stats.expired,                                        color: "#f09595" },
              { label: "Expiring in 7d",  value: stats.expiringSoon,                                   color: "#fbbf24" },
              { label: "Total Revenue",   value: `₹${(stats.revenue / 100).toLocaleString("en-IN")}`,  color: "#e8620a" },
            ].map((s) => (
              <div key={s.label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1.25rem" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "4px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters + Search */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", padding: "3px" }}>
            {(["all", "active", "expired", "expiring"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{ padding: "5px 14px", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", border: "none", background: filter === f ? "#e8620a" : "transparent", color: filter === f ? "#fff" : "#888", transition: "all 0.15s" }}
              >
                {f === "expiring" ? "Expiring Soon" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <input
            placeholder="Search name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: "200px", padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#fff", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
          />
          <div style={{ fontSize: "0.8rem", color: "#555" }}>{filtered.length} record{filtered.length !== 1 ? "s" : ""}</div>
        </div>

        {/* Table */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.6fr 1fr 90px 100px 110px 110px 90px", gap: "0", padding: "0.75rem 1.25rem", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <div>Member</div>
            <div>Email</div>
            <div>Plan</div>
            <div>Amount</div>
            <div>Started</div>
            <div>Expires</div>
            <div>Days Left</div>
            <div>Status</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No members found.</div>
          ) : (
            filtered.map((m) => {
              const days = daysLeft(m.expires_at);
              const statusColor = m.expiringSoon ? "#fbbf24" : m.isActive ? "#4ade80" : "#f09595";
              const statusLabel = m.expiringSoon ? "Expiring" : m.isActive ? "Active" : "Expired";
              return (
                <div
                  key={m.user_email}
                  style={{ display: "grid", gridTemplateColumns: "1.8fr 1.6fr 1fr 90px 100px 110px 110px 90px", gap: "0", padding: "0.9rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.82rem", alignItems: "center" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#fff" }}>{m.first_name} {m.last_name || <span style={{ color: "#555" }}>—</span>}</div>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>📍 {m.location || "—"} · {m.phone || "—"}</div>
                  </div>
                  <div style={{ color: "#888", wordBreak: "break-all" }}>{m.user_email}</div>
                  <div style={{ color: "#fff" }}>{PLAN_LABELS[m.plan] ?? m.plan}</div>
                  <div style={{ color: "#e8620a", fontWeight: 600 }}>₹{(m.amount_paid / 100).toLocaleString("en-IN")}</div>
                  <div style={{ color: "#666" }}>{fmtDate(m.started_at)}</div>
                  <div style={{ color: "#666" }}>{fmtDate(m.expires_at)}</div>
                  <div style={{ color: days < 0 ? "#f09595" : days <= 7 ? "#fbbf24" : "#888" }}>
                    {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                  </div>
                  <div>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", background: `${statusColor}18`, color: statusColor }}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
