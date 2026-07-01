"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, Button, Input, Label, Alert, Badge, Modal, StatCard, EmptyState } from "@/components/ui/ds";

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
        <div style={{ width: "320px" }}>
          <Card>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Memberships</div>
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

      {/* Header */}
      <header style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
          </Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Memberships</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" onClick={() => { setGrantEmail(""); setGrantPlan("monthly"); setGrantErr(""); setGrantOk(""); setGrantModal(true); }}>+ Grant Membership</Button>
          <Button size="sm" variant="ghost" onClick={() => load()}>Refresh</Button>
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
              <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
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
            <EmptyState title="No members found." />
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
                    <Badge color={m.expiringSoon ? "yellow" : m.isActive ? "green" : "red"} size="sm">{statusLabel}</Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 0" }}>
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => { const p = Math.max(0, page - 1); setPage(p); load({ page: p }); }}>← Previous</Button>
            <span style={{ fontSize: 13, color: "#444" }}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} records</span>
            <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => { const p = Math.min(totalPages - 1, page + 1); setPage(p); load({ page: p }); }}>Next →</Button>
          </div>
        )}

      </div>

      {/* Grant Membership Modal */}
      <Modal open={grantModal} onClose={() => setGrantModal(false)} title="Grant Membership" maxWidth={420}
        footer={
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={() => setGrantModal(false)}>Cancel</Button>
            <Button fullWidth loading={granting} onClick={(e) => handleGrant(e as unknown as React.FormEvent)}>Grant Membership</Button>
          </div>
        }>
        <form onSubmit={handleGrant} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label>User Email *</Label>
            <Input required type="email" placeholder="user@example.com" value={grantEmail} onChange={e => setGrantEmail(e.target.value)} />
          </div>
          <div>
            <Label>Plan *</Label>
            <select value={grantPlan} onChange={e => setGrantPlan(e.target.value)}
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer", colorScheme: "dark" as const }}>
              <option value="monthly">Monthly (1 month)</option>
              <option value="quarterly">Quarterly (3 months)</option>
              <option value="biannual">6 Months</option>
              <option value="annual">Annual (12 months)</option>
            </select>
          </div>
          {grantErr && <Alert variant="error">{grantErr}</Alert>}
          {grantOk  && <Alert variant="success">{grantOk}</Alert>}
          <p style={{ fontSize: 11, color: "#444", margin: 0 }}>
            Amount will be recorded as ₹0 (manual grant). Any existing active membership will be expired first.
          </p>
        </form>
      </Modal>
    </div>
  );
}
