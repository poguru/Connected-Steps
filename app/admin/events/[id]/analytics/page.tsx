"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, Button, Alert, Badge, StatCard, Spinner } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CohortWeek {
  week: string; registered: number; paid: number; checkin: number; cancelled: number;
  paid_pct: number; checkin_pct: number;
}

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
  cohort_weeks?: CohortWeek[];
  tshirt_issued?: number;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:   { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header: { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
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

// ── SVG Area Chart (registration timeline) ────────────────────────────────────

function AreaChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) return <div style={{ color: "#555", fontSize: 12, textAlign: "center", padding: "1rem" }}>No data</div>;

  const W = 800; const H = 140; const PAD = { top: 12, right: 16, bottom: 28, left: 36 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;

  // Cumulative counts
  let cum = 0;
  const pts = data.map((d, i) => {
    cum += d.count;
    return { x: PAD.left + (i / Math.max(data.length - 1, 1)) * iW, y: 0, count: d.count, date: d.date, cum };
  });
  const maxCum = Math.max(...pts.map(p => p.cum), 1);
  pts.forEach(p => { p.y = PAD.top + iH - (p.cum / maxCum) * iH; });

  const linePath  = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath  = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(PAD.top + iH).toFixed(1)} L${PAD.left},${(PAD.top + iH).toFixed(1)} Z`;

  // Y-axis labels (3 ticks)
  const yTicks = [0, 0.5, 1].map(f => ({
    y: PAD.top + iH - f * iH,
    label: Math.round(f * maxCum),
  }));
  // X-axis labels (up to 6 dates)
  const step  = Math.ceil(pts.length / 6);
  const xLabels = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, overflow: "visible" }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#e8620a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#e8620a" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {yTicks.map(t => (
        <line key={t.y} x1={PAD.left} y1={t.y} x2={PAD.left + iW} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      {/* Area fill */}
      <path d={areaPath} fill="url(#areaGrad)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="#e8620a" strokeWidth="2" strokeLinejoin="round" />
      {/* Y-axis labels */}
      {yTicks.map(t => (
        <text key={t.y} x={PAD.left - 6} y={t.y + 4} textAnchor="end" fill="#555" fontSize="10">{t.label}</text>
      ))}
      {/* X-axis labels */}
      {xLabels.map(p => (
        <text key={p.date} x={p.x} y={H - 4} textAnchor="middle" fill="#555" fontSize="9">
          {p.date.slice(5)}
        </text>
      ))}
      {/* Endpoint dot */}
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill="#e8620a" />
      )}
    </svg>
  );
}

// ── SVG Funnel Chart ──────────────────────────────────────────────────────────

function FunnelChart({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  if (!stages.length) return null;
  const max    = stages[0].value || 1;
  const W = 500; const H = stages.length * 52;
  const baseW  = W * 0.9; const minW  = W * 0.15;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 500, height: H }}>
      {stages.map((s, i) => {
        const ratio   = s.value / max;
        const w       = minW + (baseW - minW) * ratio;
        const x       = (W - w) / 2;
        const y       = i * 52;
        const nextRatio = i < stages.length - 1 ? stages[i + 1].value / max : ratio;
        const nextW   = minW + (baseW - minW) * nextRatio;
        const nextX   = (W - nextW) / 2;
        const dropPct = i > 0 && stages[i - 1].value > 0
          ? Math.round((1 - s.value / stages[i - 1].value) * 100)
          : null;

        return (
          <g key={s.label}>
            {/* Trapezoid */}
            <path
              d={`M${x},${y + 4} L${x + w},${y + 4} L${nextX + nextW},${y + 44} L${nextX},${y + 44} Z`}
              fill={s.color} opacity="0.18"
              stroke={s.color} strokeWidth="1" strokeOpacity="0.4"
            />
            {/* Label */}
            <text x={W / 2} y={y + 19} textAnchor="middle" fill={s.color} fontSize="11" fontWeight="700">{s.label}</text>
            <text x={W / 2} y={y + 33} textAnchor="middle" fill="#ccc" fontSize="13" fontWeight="900">{s.value.toLocaleString("en-IN")}</text>
            {/* Drop-off badge */}
            {dropPct !== null && dropPct > 0 && (
              <text x={W - 4} y={y + 25} textAnchor="end" fill="#f87171" fontSize="9" fontWeight="700">−{dropPct}%</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventAnalyticsPage() {
  const params  = useParams();
  const eventId = params.id as string;

  const [data,         setData]         = useState<EventAnalytics | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [resending,    setResending]    = useState(false);
  const [resendResult, setResendResult] = useState<string>("");

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

  async function resendPending() {
    if (!confirm("Send confirmation emails to all participants who haven't received one yet?")) return;
    setResending(true); setResendResult("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/resend-all-qr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retry_failed: false }) });
      const data = await res.json() as { sent?: number; failed?: number; skipped?: number };
      if (res.ok) {
        setResendResult(`✅ Sent: ${data.sent ?? 0}  ·  Skipped (already sent): ${data.skipped ?? 0}  ·  Failed: ${data.failed ?? 0}`);
        void loadData();
      } else {
        setResendResult("❌ Send failed — check the registrations page for details");
      }
    } catch { setResendResult("❌ Network error"); }
    finally   { setResending(false); }
  }

  if (loading) return <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>;
  if (!data)   return <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}><Alert variant="error">Failed to load analytics</Alert></div>;

  const { event, funnel, revenue, capacity, race_day, email, by_race, registration_timeline, cohort_weeks } = data;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Analytics — {event?.title}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={loadData}>↻ Refresh</Button>
          <a href={`/api/admin/events/${eventId}/registrations/export`} download style={{ textDecoration: "none" }}>
            <Button size="sm" variant="secondary">Export CSV</Button>
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
            <Link key={k.label} href={k.href} style={{ textDecoration: "none" }}>
              <StatCard label={k.label} value={k.value} color={k.color} style={{ cursor: "pointer" }} />
            </Link>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Registration funnel */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 12 }}>Registration Funnel</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <FunnelChart stages={[
                { label: "Registered",  value: funnel.total,       color: "#94a3b8" },
                { label: "Confirmed",   value: funnel.confirmed,   color: "#4ade80" },
                { label: "Checked In",  value: race_day.checked_in.count, color: "#60a5fa" },
                { label: "Finishers",   value: race_day.finishers.count,  color: "#e8620a" },
              ]} />
            </div>
            {[
              { label: "Total Registrations", count: funnel.total,     pct: 100,                                                                                  color: "#fff" },
              { label: "Confirmed",           count: funnel.confirmed, pct: funnel.total > 0 ? Math.round(funnel.confirmed / funnel.total * 100) : 0,             color: "#4ade80" },
              { label: "Paid",                count: funnel.paid,      pct: funnel.confirmed > 0 ? Math.round(funnel.paid / funnel.confirmed * 100) : 0,          color: "#e8620a" },
              { label: "Free / Comps",        count: funnel.free,      pct: funnel.confirmed > 0 ? Math.round(funnel.free / funnel.confirmed * 100) : 0,          color: "#a3e635" },
              { label: "Cancelled",           count: funnel.cancelled, pct: funnel.total > 0 ? Math.round(funnel.cancelled / funnel.total * 100) : 0,             color: "#f87171" },
            ].map(r => <ProgressBar key={r.label} {...r} total={funnel.total} />)}
          </div>

          {/* Race day progression */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 12 }}>Race Day Progression</div>
            {[
              { label: "Checked In",         ...race_day.checked_in,    color: "#60a5fa" },
              { label: "BIB Collected",      ...race_day.bib_collected, color: "#a78bfa" },
              { label: "Breakfast Issued",   ...race_day.breakfast,     color: "#a3e635" },
              { label: "Finishers",          ...race_day.finishers,     color: "#4ade80" },
              { label: "Certificates Sent",  ...race_day.certificates,  color: "#fbbf24" },
            ].map(r => <ProgressBar key={r.label} {...r} total={funnel.confirmed} />)}
          </div>

          {/* Email delivery */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 12 }}>Email Delivery</div>
              {email.none > 0 && (
                <Button size="xs" loading={resending} onClick={resendPending}>📧 Send to {email.none} pending</Button>
              )}
            </div>
            {resendResult && <Alert variant={resendResult.startsWith("✅") ? "success" : "error"} style={{ marginBottom: 10 }}>{resendResult}</Alert>}
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
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 12 }}>By Race / Distance</div>
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

        {/* Registration timeline — cumulative area chart */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Registration Timeline</div>
            <span style={{ fontSize: 11, color: "#555" }}>{registration_timeline.length} active days · cumulative</span>
          </div>
          {registration_timeline.length ? (
            <AreaChart data={registration_timeline} />
          ) : (
            <div style={{ padding: "1.5rem", textAlign: "center" as const }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>No registrations yet</div>
              <div style={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>Cumulative registrations will appear here as participants sign up.</div>
              <Link href={`/admin/events/${eventId}/registrations?action=register`} style={{ display: "inline-block", marginTop: 12, fontSize: 12, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                Register the first participant →
              </Link>
            </div>
          )}
        </div>

        {/* Cohort retention — weekly registration groups */}
        {cohort_weeks && cohort_weeks.length > 0 && (
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em" }}>Weekly Cohort Retention</div>
              <span style={{ fontSize: 10, color: "#444" }}>Reg → Paid → Checked In</span>
            </div>
            <div style={{ overflowX: "auto" as const }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Week of", "Registered", "Paid / Free", "Paid %", "Checked In", "Check-in %"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohort_weeks.map(w => (
                    <tr key={w.week} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "7px 10px", color: "#888", whiteSpace: "nowrap" as const }}>{w.week}</td>
                      <td style={{ padding: "7px 10px", fontVariantNumeric: "tabular-nums" }}>{w.registered}</td>
                      <td style={{ padding: "7px 10px", color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>{w.paid}</td>
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ display: "inline-block", minWidth: 32, textAlign: "right" as const, color: w.paid_pct >= 70 ? "#4ade80" : w.paid_pct >= 40 ? "#fbbf24" : "#f87171", fontWeight: 700 }}>
                          {w.paid_pct}%
                        </span>
                        <div style={{ marginTop: 3, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, width: 60 }}>
                          <div style={{ width: `${w.paid_pct}%`, height: "100%", background: "#4ade80", borderRadius: 99 }} />
                        </div>
                      </td>
                      <td style={{ padding: "7px 10px", color: "#60a5fa", fontVariantNumeric: "tabular-nums" }}>{w.checkin}</td>
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ display: "inline-block", minWidth: 32, textAlign: "right" as const, color: w.checkin_pct >= 70 ? "#60a5fa" : w.checkin_pct >= 40 ? "#fbbf24" : "#f87171", fontWeight: 700 }}>
                          {w.checkin > 0 ? `${w.checkin_pct}%` : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
