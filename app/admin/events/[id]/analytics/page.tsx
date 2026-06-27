"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventAnalytics {
  event:    { title: string; start_date: string; capacity: number | null; participant_count: number };
  funnel:   { total: number; confirmed: number; paid: number; free: number; pending: number; cancelled: number };
  revenue:  { total: number; avg_per_participant: number };
  capacity: { max: number | null; used: number; pct: number | null };
  race_day: {
    checked_in:    { count: number; pct: number };
    bib_collected: { count: number; pct: number };
    breakfast:     { count: number; pct: number };
    finishers:     { count: number; pct: number };
    certificates:  { count: number; pct: number };
  };
  email:    { sent: number; failed: number; none: number; rate: number };
  by_race:  Record<string, { total: number; paid: number; revenue: number; checked_in: number; finishers: number }>;
  registration_timeline: { date: string; count: number }[];
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:   { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header: { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  card:   { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" } as React.CSSProperties,
  h2:     { fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 12 } as React.CSSProperties,
};

function fmtInr(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

function ProgressBar({ label, count, pct, color = "#e8620a", total }: { label: string; count: number; pct: number; color?: string; total?: number }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color }}>{count}</span>
          {total !== undefined && <span style={{ fontSize: 11, color: "#555" }}>/ {total}</span>}
          <span style={{ fontSize: 12, color, fontWeight: 700 }}>{pct}%</span>
        </div>
      </div>
      <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 999, height: 6 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ── Micro bar chart ───────────────────────────────────────────────────────────

function TimelineChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) return <div style={{ color: "#555", fontSize: 12, textAlign: "center", padding: "1rem" }}>No data</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 70, overflowX: "auto" as const }}>
      {data.map(d => (
        <div key={d.date} title={`${d.date}: ${d.count} registrations`} style={{ flex: "0 0 auto", minWidth: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 8, height: Math.max(2, Math.round((d.count / max) * 56)), background: "#e8620a", borderRadius: "2px 2px 0 0", opacity: 0.85 }} />
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventAnalyticsPage() {
  const params  = useParams();
  const eventId = params.id as string;

  const [data,    setData]    = useState<EventAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      // Use shared stats endpoint — same source of truth as Event Hub
      const [analyticsRes, statsRes] = await Promise.all([
        fetch(`/api/admin/events/${eventId}/analytics`),
        fetch(`/api/admin/events/${eventId}/stats`),
      ]);
      const analytics = await analyticsRes.json();
      const shared    = await statsRes.json();

      // Merge: prefer shared stats for funnel/revenue, keep analytics for
      // race_day progression and email delivery details
      if (shared?.stats) {
        const s = shared.stats;
        analytics.funnel   = { total: s.total, confirmed: s.confirmed, paid: s.paid, free: s.free, pending: s.pending, cancelled: s.cancelled };
        analytics.revenue  = { total: s.revenue_collected, avg_per_participant: s.avg_per_paid };
        analytics.capacity = { max: s.capacity_max, used: s.capacity_filled, pct: s.capacity_pct };
        analytics.email    = { sent: s.email_sent, failed: s.email_failed, none: s.email_none, rate: s.confirmed > 0 ? Math.round(s.email_sent / s.confirmed * 100) : 0 };
        analytics.by_race  = s.by_category ?? {};
        analytics.registration_timeline = s.timeline ?? [];
      }
      setData(analytics);
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); /* eslint-disable-next-line */ }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
      Loading analytics…
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171" }}>
      Failed to load analytics
    </div>
  );

  const { event, funnel, revenue, capacity, race_day, email, by_race, registration_timeline } = data;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Analytics — {event?.title}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadData} title="Refresh" style={{ padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#555", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>↻</button>
          <a href={`/api/admin/events/${eventId}/registrations/export`} download style={{ padding: "6px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            Export CSV
          </a>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.75rem 2rem", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Top row: KPIs — each links to corresponding management page */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "Total Registered", value: funnel.total,                                                   color: "#fff",     href: `/admin/events/${eventId}/registrations` },
            { label: "Confirmed",         value: funnel.confirmed,                                              color: "#4ade80",  href: `/admin/events/${eventId}/registrations?payment_status=paid` },
            { label: "Revenue",           value: fmtInr(revenue.total),                                         color: "#e8620a",  href: `/admin/events/${eventId}/registrations` },
            { label: "Avg per Paid",      value: fmtInr(revenue.avg_per_participant),                           color: "#fbbf24",  href: `/admin/events/${eventId}/registrations` },
            { label: "Capacity",          value: capacity.pct !== null ? `${capacity.pct}%` : "Unlimited",      color: capacity.pct && capacity.pct > 90 ? "#f87171" : "#60a5fa", href: `/admin/events/${eventId}/registrations` },
          ].map(k => (
            <Link key={k.label} href={k.href} style={{ ...S.card, textDecoration: "none", display: "block" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", fontWeight: 600 }}>{k.label}</div>
            </Link>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Registration funnel */}
          <div style={S.card}>
            <div style={S.h2}>Registration Funnel</div>
            {[
              { label: "Total Registrations", count: funnel.total,     pct: 100,                                                                                  color: "#fff" },
              { label: "Confirmed",           count: funnel.confirmed, pct: funnel.total > 0 ? Math.round(funnel.confirmed / funnel.total * 100) : 0,             color: "#4ade80" },
              { label: "Paid",                count: funnel.paid,      pct: funnel.confirmed > 0 ? Math.round(funnel.paid / funnel.confirmed * 100) : 0,          color: "#e8620a" },
              { label: "Free / Comps",        count: funnel.free,      pct: funnel.confirmed > 0 ? Math.round(funnel.free / funnel.confirmed * 100) : 0,          color: "#a3e635" },
              { label: "Cancelled",           count: funnel.cancelled, pct: funnel.total > 0 ? Math.round(funnel.cancelled / funnel.total * 100) : 0,             color: "#f87171" },
            ].map(r => <ProgressBar key={r.label} {...r} total={funnel.total} />)}
          </div>

          {/* Race day progression */}
          <div style={S.card}>
            <div style={S.h2}>Race Day Progression</div>
            {[
              { label: "Checked In",         ...race_day.checked_in,    color: "#60a5fa" },
              { label: "BIB Collected",      ...race_day.bib_collected, color: "#a78bfa" },
              { label: "Breakfast Issued",   ...race_day.breakfast,     color: "#a3e635" },
              { label: "Finishers",          ...race_day.finishers,     color: "#4ade80" },
              { label: "Certificates Sent",  ...race_day.certificates,  color: "#fbbf24" },
            ].map(r => <ProgressBar key={r.label} {...r} total={funnel.confirmed} />)}
          </div>

          {/* Email delivery */}
          <div style={S.card}>
            <div style={S.h2}>Email Delivery</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Sent",    value: email.sent,   color: "#4ade80" },
                { label: "Failed",  value: email.failed, color: "#f87171" },
                { label: "Pending", value: email.none,   color: "#fbbf24" },
                { label: "Rate",    value: `${email.rate}%`, color: email.rate > 90 ? "#4ade80" : "#fbbf24" },
              ].map(e => (
                <div key={e.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: e.color }}>{e.value}</div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 600, textTransform: "uppercase" as const }}>{e.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, height: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", display: "flex" }}>
                <div style={{ width: `${email.rate}%`, background: "#4ade80" }} />
                <div style={{ width: `${Math.round(email.failed / (funnel.confirmed || 1) * 100)}%`, background: "#f87171" }} />
              </div>
            </div>
          </div>

          {/* Race distribution */}
          <div style={S.card}>
            <div style={S.h2}>By Race / Distance</div>
            {Object.entries(by_race).length === 0 ? (
              <div style={{ padding: "1.5rem", textAlign: "center" as const }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🏁</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>No category data yet</div>
                <div style={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>
                  This table shows registrations broken down by race/distance category.<br/>
                  Data will appear once participants register and select a distance.
                </div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Race", "Total", "Paid", "Revenue", "Checked In"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(by_race).map(([cat, v]) => (
                    <tr key={cat} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "8px", fontWeight: 700 }}>{cat}</td>
                      <td style={{ padding: "8px", color: "#aaa" }}>{v.total}</td>
                      <td style={{ padding: "8px", color: "#4ade80" }}>{v.paid}</td>
                      <td style={{ padding: "8px", color: "#e8620a", fontWeight: 700 }}>{fmtInr(v.revenue)}</td>
                      <td style={{ padding: "8px", color: "#60a5fa" }}>{v.checked_in}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Registration timeline */}
        <div style={S.card}>
          <div style={S.h2}>Registration Timeline</div>
          {registration_timeline.length ? (
            <>
              <TimelineChart data={registration_timeline} />
              <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
                {registration_timeline.length} days with registrations · Total {funnel.total} registrations
              </div>
            </>
          ) : (
            <div style={{ padding: "1.5rem", textAlign: "center" as const }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>No registrations yet</div>
              <div style={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>
                Daily registration activity will be charted here as participants sign up.<br/>
                Each bar represents registrations received on a given day.
              </div>
              <Link href={`/admin/events/${eventId}/registrations?action=register`} style={{ display: "inline-block", marginTop: 12, fontSize: 12, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                Register the first participant →
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
