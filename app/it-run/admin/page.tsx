"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardStats {
  summary: {
    totalRegistrations: number; paidRegistrations: number; freeRegistrations: number;
    pendingRegistrations: number; totalParticipants: number; totalRevenue: number;
    bibsCollected: number; checkedIn: number;
  };
  verificationStats: {
    total: number; pending: number; verified: number;
    rejected: number; need_clarification: number;
  };
  categoryStats: Array<{ id: string; name: string; color: string; price: number; registered: number; maxParticipants: number | null }>;
  dailyRegistrations: Array<{ date: string; count: number }>;
}

const ACCENT = "#e8620a";

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 900, color: color ?? "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [data,    setData]    = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/it-run/admin/dashboard")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div>;
  if (!data)  return <div style={{ color: "#f87171", padding: 40 }}>Failed to load dashboard. Check authentication.</div>;

  const { summary, verificationStats, categoryStats, dailyRegistrations } = data;
  const maxDay = Math.max(...dailyRegistrations.map(d => d.count), 1);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Event Dashboard</h1>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>The IT Run Sprint-2 | August 17, 2026</div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        <KPI label="Total Registrations" value={String(summary.totalRegistrations)} color={ACCENT} />
        <KPI label="Paid"                value={String(summary.paidRegistrations)}   color="#10b981" />
        <KPI label="Pending Payment"     value={String(summary.pendingRegistrations)} color="#f59e0b" />
        <KPI label="Total Participants"  value={String(summary.totalParticipants)} />
        <KPI label="Revenue"             value={`Rs.${summary.totalRevenue.toLocaleString("en-IN")}`} color="#60a5fa" />
        <KPI label="BIBs Collected"      value={String(summary.bibsCollected)} />
        <KPI label="Checked In"          value={String(summary.checkedIn)} color="#a78bfa" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginBottom: 24 }}>

        {/* Category breakdown */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 16 }}>Registrations by Category</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {categoryStats.map(cat => {
              const pct = cat.maxParticipants ? Math.round((cat.registered / cat.maxParticipants) * 100) : null;
              return (
                <div key={cat.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#ccc" }}>{cat.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: cat.color ?? ACCENT }}>
                      {cat.registered}{cat.maxParticipants ? `/${cat.maxParticipants}` : ""}
                    </span>
                  </div>
                  {cat.maxParticipants && (
                    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${Math.min(100, pct ?? 0)}%`, background: cat.color ?? ACCENT, borderRadius: 2, transition: "width 0.5s" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Verification stats */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>ID Verification</div>
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
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily registrations bar chart */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 16 }}>Daily Registrations (7 days)</div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 80 }}>
            {dailyRegistrations.map(d => (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, color: "#888" }}>{d.count || ""}</div>
                <div style={{
                  width: "100%",
                  height: Math.max(4, Math.round((d.count / maxDay) * 60)),
                  background: ACCENT,
                  borderRadius: "3px 3px 0 0",
                  opacity: 0.8,
                }} />
                <div style={{ fontSize: 9, color: "#555" }}>{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        {[
          { label: "Review IDs",        href: "/it-run/admin/verification",  color: "#6366f1" },
          { label: "Allocate BIBs",     href: "/it-run/admin/bibs",          color: ACCENT },
          { label: "Export Report",     href: "/api/it-run/admin/reports?type=participants", color: "#10b981" },
          { label: "Manage Slots",      href: "/it-run/admin/bib-slots",     color: "#f59e0b" },
        ].map(a => (
          <Link key={a.label} href={a.href}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "14px 16px", background: `${a.color}10`,
              border: `1px solid ${a.color}30`, borderRadius: 12,
              color: a.color, fontWeight: 700, fontSize: 13,
              textDecoration: "none", textAlign: "center",
              transition: "background 0.2s",
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
