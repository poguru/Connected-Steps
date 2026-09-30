"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface CategoryStat {
  id: string; name: string; color: string; price: number; categoryType: string;
  confirmedRegs: number; confirmedParts: number; pendingRegs: number;
  maxParticipants: number | null;
}

interface DashboardData {
  event: { title: string; event_date: string };
  summary: {
    totalRegistrations: number; confirmedRegistrations: number;
    paidRegistrations: number; freeRegistrations: number;
    pendingRegistrations: number; expiredRegistrations: number;
    failedRegistrations: number; cancelledRegistrations: number;
    totalParticipants: number;
    grossRevenue: number; totalDiscounts: number; netRevenue: number;
    couponRegistrations: number; couponDiscount: number;
    bibsCollected: number; bibsTotal: number;
    checkedIn: number; checkInTotal: number;
  };
  verificationStats: {
    total: number; pending: number; verified: number;
    rejected: number; need_clarification: number;
  };
  genderBreakdown: { male: number; female: number; other: number };
  categoryStats: CategoryStat[];
  dailyRegistrations: Array<{ date: string; count: number }>;
  reconciliation: Record<string, number>;
  lastUpdated: string;
}

const ACCENT = "#e8620a";

function fmt(n: number) { return n.toLocaleString("en-IN"); }

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00+05:30");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatLastUpdated(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color, tooltip }: {
  label: string; value: string; sub?: string; color?: string; tooltip?: string;
}) {
  return (
    <div title={tooltip} style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: "18px 20px", cursor: tooltip ? "help" : undefined,
    }}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: "clamp(22px,3vw,30px)", fontWeight: 900, color: color ?? "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number | null; color: string }) {
  if (!max) return null;
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 4 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.5s" }} />
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState(false);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else { setLoading(true); setError(false); }

    fetch("/api/it-run/admin/dashboard")
      .then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then(d => { setData(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>;
  if (error || !data) return (
    <div style={{ color: "#f87171", padding: 40 }}>
      <div style={{ marginBottom: 12 }}>Failed to load dashboard — check your admin session.</div>
      <button onClick={() => load()} style={{ padding: "8px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Retry</button>
    </div>
  );

  const { event, summary, verificationStats, genderBreakdown, categoryStats, dailyRegistrations, lastUpdated } = data;
  const maxDay = Math.max(...dailyRegistrations.map(d => d.count), 1);
  const checkInPct = summary.checkInTotal > 0 ? Math.round((summary.checkedIn / summary.checkInTotal) * 100) : 0;
  const bibPct     = summary.bibsTotal    > 0 ? Math.round((summary.bibsCollected / summary.bibsTotal) * 100) : 0;

  return (
    <div style={{ maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Event Dashboard</h1>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            {event.title} | {formatDate(event.event_date)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#555" }}>Updated {formatLastUpdated(lastUpdated)} IST</span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: refreshing ? "#555" : "#ccc", cursor: refreshing ? "default" : "pointer", fontFamily: "inherit", fontSize: 12 }}>
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* ── Registration KPIs ───────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Registrations</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
        <KPI label="Total Active" value={fmt(summary.totalRegistrations)}
          color={ACCENT} tooltip="Confirmed (paid + free) + pending registrations. Excludes cancelled, failed, expired." />
        <KPI label="Confirmed" value={fmt(summary.confirmedRegistrations)}
          color="#10b981" sub={`${summary.paidRegistrations} paid · ${summary.freeRegistrations} free`}
          tooltip="Paid + free registrations with active status" />
        <KPI label="Pending Payment" value={fmt(summary.pendingRegistrations)}
          color="#f59e0b" tooltip="Registered, payment window open" />
        <KPI label="Cancelled" value={fmt(summary.cancelledRegistrations)}
          color="#6b7280" tooltip="Admin-cancelled registrations" />
        <KPI label="Failed / Expired" value={fmt(summary.failedRegistrations + summary.expiredRegistrations)}
          color="#4b5563" sub={`${summary.failedRegistrations} failed · ${summary.expiredRegistrations} expired`}
          tooltip="Payment failed or payment window lapsed" />
        <KPI label="Total Participants" value={fmt(summary.totalParticipants)}
          color="#e2e8f0" tooltip="Sum of participant_count across confirmed (paid+free) registrations only" />
      </div>

      {/* ── Revenue KPIs ──────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Revenue</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
        <KPI label="Gross Revenue" value={`₹${fmt(summary.grossRevenue)}`}
          color="#60a5fa" tooltip="Sum of final_price from active paid registrations" />
        <KPI label="Coupons Used" value={fmt(summary.couponRegistrations)}
          color="#a78bfa" sub={`₹${fmt(summary.couponDiscount)} discounted`}
          tooltip="Confirmed registrations that used a coupon" />
      </div>

      {/* ── Event-day KPIs ────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Event Day</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 24 }}>
        <KPI label="BIBs Collected" value={`${fmt(summary.bibsCollected)} / ${fmt(summary.bibsTotal)}`}
          color={bibPct === 100 ? "#10b981" : "#e2e8f0"} sub={`${bibPct}% collected`}
          tooltip="BIB collections scoped to this event's participants" />
        <KPI label="Checked In" value={`${fmt(summary.checkedIn)} / ${fmt(summary.checkInTotal)}`}
          color={summary.checkedIn === summary.checkInTotal && summary.checkInTotal > 0 ? "#10b981" : "#a78bfa"}
          sub={`${checkInPct}% checked in`}
          tooltip="Race-day check-ins scoped to this event's participants" />
      </div>

      {/* ── Detail panels ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginBottom: 20 }}>

        {/* Category breakdown */}
        <SectionCard title="Registrations by Category">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {categoryStats.length === 0 && <div style={{ fontSize: 13, color: "#555" }}>No active categories</div>}
            {categoryStats.map(cat => {
              const total = cat.confirmedRegs + cat.pendingRegs;
              const displayMax = cat.maxParticipants;
              const pct = displayMax ? Math.round((cat.confirmedParts / displayMax) * 100) : null;
              return (
                <div key={cat.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: "#ccc", flex: 1, marginRight: 8 }}>{cat.name}</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cat.color ?? ACCENT }}>
                        {fmt(cat.confirmedRegs)}{displayMax ? `/${fmt(displayMax)}` : ""}
                      </span>
                      {cat.pendingRegs > 0 && (
                        <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 4 }}>+{cat.pendingRegs} pend</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>
                    {cat.confirmedParts} participant{cat.confirmedParts !== 1 ? "s" : ""}
                    {pct !== null ? ` · ${pct}% filled` : ""}
                  </div>
                  <ProgressBar value={cat.confirmedParts} max={displayMax} color={cat.color ?? ACCENT} />
                </div>
              );
            })}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666" }}>
              <span>Total confirmed</span>
              <span>{fmt(categoryStats.reduce((s, c) => s + c.confirmedRegs, 0))} registrations · {fmt(summary.totalParticipants)} participants</span>
            </div>
          </div>
        </SectionCard>

        {/* ID Verification */}
        <SectionCard title="ID Verification">
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -32, marginBottom: 8 }}>
            <Link href="/it-run/admin/verification" style={{ fontSize: 12, color: ACCENT, textDecoration: "none" }}>Review Queue</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Pending Review", value: verificationStats.pending,            color: "#f59e0b" },
              { label: "Verified",       value: verificationStats.verified,            color: "#10b981" },
              { label: "Rejected",       value: verificationStats.rejected,            color: "#ef4444" },
              { label: "Clarification",  value: verificationStats.need_clarification, color: "#6366f1" },
            ].map(s => (
              <div key={s.label} style={{ background: `${s.color}10`, border: `1px solid ${s.color}30`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{fmt(s.value)}</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#555", textAlign: "center" }}>
            Total in DB: {fmt(verificationStats.total)}
            {verificationStats.total !== (verificationStats.pending + verificationStats.verified + verificationStats.rejected + verificationStats.need_clarification) && (
              <span style={{ color: "#f59e0b", marginLeft: 6 }}>⚠ count mismatch</span>
            )}
          </div>
        </SectionCard>

        {/* Gender breakdown */}
        <SectionCard title="Participant Gender">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Male",   value: genderBreakdown.male,   color: "#60a5fa" },
              { label: "Female", value: genderBreakdown.female, color: "#f472b6" },
              { label: "Other",  value: genderBreakdown.other,  color: "#a78bfa" },
            ].map(g => {
              const total = verificationStats.total || 1;
              const pct = Math.round((g.value / total) * 100);
              return (
                <div key={g.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#ccc" }}>{g.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: g.color }}>{fmt(g.value)} <span style={{ color: "#555", fontWeight: 400 }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: g.color, borderRadius: 2, transition: "width 0.5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

      </div>

      {/* ── Daily registrations bar chart ──────────────────────────────────── */}
      <SectionCard title="Daily Registrations (7 days — IST)">
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
          {dailyRegistrations.map(d => (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, color: "#888" }}>{d.count || ""}</div>
              <div style={{
                width: "100%",
                height: Math.max(4, Math.round((d.count / maxDay) * 60)),
                background: ACCENT,
                borderRadius: "3px 3px 0 0",
                opacity: 0.85,
                transition: "height 0.4s",
              }} />
              <div style={{ fontSize: 9, color: "#555" }}>{d.date.slice(5).replace("-", "/")}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#555" }}>Counts paid + free + pending active registrations. Dates in IST (Asia/Kolkata).</div>
      </SectionCard>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 20 }}>
        {[
          { label: "Review IDs",    href: "/it-run/admin/verification",                    color: "#6366f1" },
          { label: "Allocate BIBs", href: "/it-run/admin/bibs",                            color: ACCENT    },
          { label: "Export Report", href: "/api/it-run/admin/reports?type=participants",    color: "#10b981" },
          { label: "Manage Slots",  href: "/it-run/admin/bib-slots",                       color: "#f59e0b" },
          { label: "Feedback",      href: "/it-run/admin/feedback",                        color: "#a78bfa" },
        ].map(a => (
          <Link key={a.label} href={a.href}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "14px 16px", background: `${a.color}10`,
              border: `1px solid ${a.color}30`, borderRadius: 12,
              color: a.color, fontWeight: 700, fontSize: 13,
              textDecoration: "none", textAlign: "center", transition: "background 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${a.color}20`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${a.color}10`)}>
            {a.label}
          </Link>
        ))}
      </div>

    </div>
  );
}
