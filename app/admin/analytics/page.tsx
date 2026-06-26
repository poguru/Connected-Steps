"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Analytics {
  period:  { months: number; labels: string[] };
  summary: {
    total_revenue: number; event_revenue: number; membership_revenue: number;
    active_memberships: number; total_new_users: number;
    total_registrations: number; paid_registrations: number; free_registrations: number;
    events_published: number; events_upcoming: number; check_in_rate: number;
  };
  growth:  { revenue: number; users: number; registrations: number };
  trends:  { revenue: number[]; new_users: number[]; registrations: number[]; memberships: number[] };
}

// ── Sparkline SVG ──────────────────────────────────────────────────────────

function Sparkline({ values, color = "#e8620a", height = 40 }: { values: number[]; color?: string; height?: number }) {
  if (!values.length || values.every(v => v === 0)) {
    return <div style={{ height, background: "rgba(255,255,255,0.03)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 10, color: "#333" }}>No data</span>
    </div>;
  }

  const max  = Math.max(...values, 1);
  const w    = 100;
  const pts  = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  }).join(" ");

  const area = `0,${height} ${pts} ${w},${height}`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id={`g${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#g${color.replace("#", "")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function BarChart({ values, labels, color = "#e8620a", height = 80 }: { values: number[]; labels: string[]; color?: string; height?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div title={`${labels[i]}: ${v}`} style={{ width: "100%", height: Math.max(2, Math.round((v / max) * (height - 20))), background: color, borderRadius: "2px 2px 0 0", opacity: 0.85, minHeight: v > 0 ? 2 : 0, transition: "height 0.3s ease" }} />
          <div style={{ fontSize: 9, color: "#444", textAlign: "center", lineHeight: 1 }}>{labels[i].slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Growth badge ──────────────────────────────────────────────────────────────

function Growth({ pct }: { pct: number }) {
  const up    = pct >= 0;
  const label = `${up ? "+" : ""}${pct}% vs last month`;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#4ade80" : "#f87171", background: up ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", padding: "2px 8px", borderRadius: 999 }}>
      {up ? "↑" : "↓"} {label}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color = "#fff", trend, sparkline, sparkColor }: {
  label:       string;
  value:       string;
  sub?:        string;
  color?:      string;
  trend?:      number;
  sparkline?:  number[];
  sparkColor?: string;
}) {
  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.1rem 1.25rem" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>{sub}</div>}
      {trend !== undefined && <div style={{ marginBottom: 8 }}><Growth pct={trend} /></div>}
      {sparkline && <Sparkline values={sparkline} color={sparkColor ?? "#e8620a"} height={36} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:    { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header:  { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  section: { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.5rem" } as React.CSSProperties,
  h2:      { fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 16 } as React.CSSProperties,
};

function fmt(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data,    setData]    = useState<Analytics | null>(null);
  const [months,  setMonths]  = useState(6);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [months]);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/analytics?months=${months}`);
      const d    = await res.json();
      setData(d);
    } finally { setLoading(false); }
  }

  const labels = data?.period.labels.map(m => m) ?? [];

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Image src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
          </Link>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Analytics & Reports</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#555" }}>Period:</span>
          {[3, 6, 12].map(m => (
            <button key={m} onClick={() => setMonths(m)} style={{ padding: "5px 12px", background: months === m ? "#e8620a" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: months === m ? "#fff" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {m}M
            </button>
          ))}
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.75rem 2rem", display: "flex", flexDirection: "column", gap: 20 }}>

        {loading && !data ? (
          <div style={{ textAlign: "center", padding: "5rem", color: "#555" }}>Loading analytics…</div>
        ) : data ? (<>

          {/* Revenue section */}
          <div>
            <div style={S.h2}>Revenue</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
              <KPI label="Total Revenue"        value={fmt(data.summary.total_revenue)}        color="#e8620a" trend={data.growth.revenue}       sparkline={data.trends.revenue}       sparkColor="#e8620a" />
              <KPI label="Event Revenue"        value={fmt(data.summary.event_revenue)}        color="#fbbf24" sparkline={data.trends.revenue.map((_, i) => data.trends.revenue[i])} sparkColor="#fbbf24" />
              <KPI label="Membership Revenue"   value={fmt(data.summary.membership_revenue)}   color="#60a5fa" sparkline={data.trends.memberships} sparkColor="#60a5fa" />
            </div>
            <div style={S.section}>
              <div style={S.h2}>Revenue by Month (₹)</div>
              <BarChart values={data.trends.revenue} labels={labels} color="#e8620a" height={100} />
            </div>
          </div>

          {/* Members section */}
          <div>
            <div style={S.h2}>Members & Growth</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
              <KPI label="Active Members"    value={String(data.summary.active_memberships)} color="#4ade80" />
              <KPI label="New Users"         value={String(data.summary.total_new_users)}    color="#60a5fa" trend={data.growth.users} sparkline={data.trends.new_users} sparkColor="#60a5fa" />
              <KPI label="New Memberships"   value={String(data.trends.memberships.reduce((a, b) => a + b, 0))} color="#a78bfa" sparkline={data.trends.memberships} sparkColor="#a78bfa" />
              <KPI label="Upcoming Events"   value={String(data.summary.events_upcoming)} sub={`${data.summary.events_published} published`} />
            </div>
            <div style={S.section}>
              <div style={S.h2}>New Users by Month</div>
              <BarChart values={data.trends.new_users} labels={labels} color="#60a5fa" height={80} />
            </div>
          </div>

          {/* Events section */}
          <div>
            <div style={S.h2}>Event Registrations</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
              <KPI label="Total Registrations" value={String(data.summary.total_registrations)}  trend={data.growth.registrations} sparkline={data.trends.registrations} />
              <KPI label="Paid"                value={String(data.summary.paid_registrations)}   color="#4ade80" />
              <KPI label="Free / Comps"        value={String(data.summary.free_registrations)}   color="#a3e635" />
              <KPI label="Check-In Rate"       value={`${data.summary.check_in_rate}%`}          color={data.summary.check_in_rate > 70 ? "#4ade80" : "#fbbf24"} />
            </div>
            <div style={S.section}>
              <div style={S.h2}>Registrations by Month</div>
              <BarChart values={data.trends.registrations} labels={labels} color="#4ade80" height={80} />
            </div>
          </div>

          {/* Quick links */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { label: "↗ Export Full Report (CSV)", href: "/api/admin/export", note: "Use Admin › Export" },
              { label: "📊 Finance & Settlement",    href: "/admin/finance",    note: "Revenue & Razorpay fees" },
              { label: "🏆 Leaderboard Archive",     href: "/admin/leaderboard", note: "Monthly rank snapshots" },
            ].map(l => (
              <Link key={l.label} href={l.href} style={{ ...S.section, textDecoration: "none", display: "block", padding: "1rem 1.25rem" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#e8620a", marginBottom: 4 }}>{l.label}</div>
                <div style={{ fontSize: 12, color: "#555" }}>{l.note}</div>
              </Link>
            ))}
          </div>

        </>) : null}
      </div>
    </div>
  );
}
