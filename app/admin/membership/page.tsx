"use client";

import { useState, useEffect, useRef } from "react";
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
  const [authed,   setAuthed]   = useState(true);
  const [members,  setMembers]  = useState<Member[]>([]);
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState<Filter>("all");
  const [search,   setSearch]   = useState("");
  const [error,    setError]    = useState("");

  // Grant membership modal
  const [grantModal, setGrantModal] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPlan,  setGrantPlan]  = useState("monthly");
  const [granting,   setGranting]   = useState(false);
  const [grantErr,   setGrantErr]   = useState("");
  const [grantOk,    setGrantOk]    = useState("");

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

  const PAGE_SIZE = 50;
  const [page,       setPage]       = useState(0);
  const [total,      setTotal]      = useState(0);
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>(null);

  async function load(opts?: { page?: number; filter?: Filter; search?: string }) {
    const p = opts?.page   ?? page;
    const f = opts?.filter ?? filter;
    const q = opts?.search ?? search;

    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(PAGE_SIZE),
        sort:  "created_at",
        order: "desc",
      });
      if (f && f !== "all") params.set("status", f);
      if (q.trim()) params.set("q", q.trim());

      const res  = await fetch(`/api/admin/memberships?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
      setMembers(data.memberships);
      setStats(data.stats);
      setTotal(data.total ?? 0);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setGrantErr(""); setGrantOk(""); setGranting(true);
    try {
      const r = await fetch("/api/admin/memberships/grant", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: grantEmail.trim().toLowerCase(), plan: grantPlan }),
      });
      const d = await r.json();
      if (!r.ok) { setGrantErr(d.error ?? "Failed"); return; }
      const exp = new Date(d.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      setGrantOk(`Membership granted! Expires ${exp}`);
      await load();
      setTimeout(() => { setGrantModal(false); setGrantEmail(""); setGrantOk(""); }, 2000);
    } catch { setGrantErr("Network error."); }
    finally { setGranting(false); }
  }

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (authed) load(); }, [authed]);

  // Server-side filtering/search — results already paginated from API
  const visible    = members;
  const totalPages = Math.ceil(total / PAGE_SIZE);

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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { setGrantEmail(""); setGrantPlan("monthly"); setGrantErr(""); setGrantOk(""); setGrantModal(true); }}
            style={{ fontSize: "0.75rem", color: "#fff", background: "#e8620a", border: "none", borderRadius: "4px", padding: "5px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
          >
            + Grant Membership
          </button>
          <button
            onClick={() => load()}
            style={{ fontSize: "0.75rem", color: "#888", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}
          >
            Refresh
          </button>
        </div>
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
                onClick={() => { setFilter(f); setPage(0); load({ page: 0, filter: f, search }); }}
                style={{ padding: "5px 14px", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", border: "none", background: filter === f ? "#e8620a" : "transparent", color: filter === f ? "#fff" : "#888", transition: "all 0.15s" }}
              >
                {f === "expiring" ? "Expiring Soon" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <input
            placeholder="Search name, email or phone…"
            value={search}
            onChange={(e) => {
              const q = e.target.value;
              setSearch(q);
              setPage(0);
              if (searchDebounce.current) clearTimeout(searchDebounce.current);
              searchDebounce.current = setTimeout(() => load({ page: 0, filter, search: q }), 350);
            }}
            style={{ flex: 1, minWidth: "200px", padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#fff", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
          />
          <div style={{ fontSize: "0.8rem", color: "#555" }}>{total} record{total !== 1 ? "s" : ""}</div>
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

          {visible.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No members found.</div>
          ) : (
            visible.map((m) => {
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

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 0" }}>
            <button
              onClick={() => { const p = Math.max(0, page - 1); setPage(p); load({ page: p }); }}
              disabled={page === 0}
              style={{ padding: "6px 16px", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, color: page === 0 ? "#333" : "#888", cursor: page === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13 }}
            >
              ← Previous
            </button>
            <span style={{ fontSize: 13, color: "#444" }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} records
            </span>
            <button
              onClick={() => { const p = Math.min(totalPages - 1, page + 1); setPage(p); load({ page: p }); }}
              disabled={page >= totalPages - 1}
              style={{ padding: "6px 16px", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, color: page >= totalPages - 1 ? "#333" : "#888", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13 }}
            >
              Next →
            </button>
          </div>
        )}

      </div>

      {/* Grant Membership Modal */}
      {grantModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "2rem", width: "100%", maxWidth: 420 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Grant Membership</div>
              <button onClick={() => setGrantModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
            </div>

            <form onSubmit={handleGrant} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  User Email *
                </label>
                <input
                  required type="email"
                  placeholder="user@example.com"
                  value={grantEmail}
                  onChange={e => setGrantEmail(e.target.value)}
                  style={{ width: "100%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Plan *
                </label>
                <select
                  value={grantPlan}
                  onChange={e => setGrantPlan(e.target.value)}
                  style={{ width: "100%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer", colorScheme: "dark" as const }}
                >
                  <option value="monthly">Monthly (1 month)</option>
                  <option value="quarterly">Quarterly (3 months)</option>
                  <option value="biannual">6 Months</option>
                  <option value="annual">Annual (12 months)</option>
                </select>
              </div>

              {grantErr && (
                <div style={{ background: "rgba(220,50,50,0.1)", border: "1px solid rgba(220,50,50,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171" }}>
                  {grantErr}
                </div>
              )}
              {grantOk && (
                <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#4ade80" }}>
                  {grantOk}
                </div>
              )}

              <p style={{ fontSize: 11, color: "#444", margin: 0 }}>
                Amount will be recorded as ₹0 (manual grant). Any existing active membership will be expired first.
              </p>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button" onClick={() => setGrantModal(false)}
                  style={{ flex: 1, padding: "10px", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: "#aaa", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={granting}
                  style={{ flex: 1, padding: "10px", background: granting ? "#1a1a1a" : "#e8620a", border: "none", borderRadius: 8, color: granting ? "#444" : "#fff", fontWeight: 600, fontSize: 13, cursor: granting ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {granting ? "Granting…" : "Grant Membership"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
