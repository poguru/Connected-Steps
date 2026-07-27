"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface DashData {
  gross_revenue: number;
  net_revenue: number;
  pending_payments: number;
  refunded: number;
  coupon_discounts: number;
  event_revenue: number;
  membership_revenue: number;
  merchandise_revenue: number;
  donation_revenue: number;
  sponsor_revenue: number;
  manual_payments: number;
  payouts_pending: number;
  payouts_paid: number;
  platform_fees: number;
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, sub, color = "#e8620a", href }: {
  label: string; value: string; sub?: string; color?: string; href?: string;
}) {
  const card = (
    <div style={{
      background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#444" }}>{sub}</div>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{card}</Link>;
  return card;
}

export default function FinanceDashboard() {
  const [data,     setData]     = useState<DashData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [orgId,    setOrgId]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (orgId)    params.set("org_id",    orgId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo)   params.set("date_to",   dateTo);
    const res = await fetch(`/api/admin/finance/dashboard?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [orgId, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  const inputStyle: React.CSSProperties = {
    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Finance Dashboard</h1>
          <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Revenue across all channels</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          <span style={{ color: "#444", fontSize: 12 }}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          <input placeholder="Org ID" value={orgId} onChange={e => setOrgId(e.target.value)}
            style={{ ...inputStyle, width: 140 }} />
          <button onClick={load} style={{
            background: "#e8620a", border: "none", borderRadius: 6, color: "#fff",
            fontSize: 12, fontWeight: 600, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit",
          }}>Apply</button>
          <Link href="/api/admin/finance/reports?format=csv&report=registrations" style={{
            fontSize: 12, color: "#555", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
            padding: "6px 12px", textDecoration: "none",
          }}>Export CSV ↗</Link>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>Loading…</div>
      ) : data ? (
        <>
          {/* Primary metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
            <StatCard label="Gross Revenue"    value={fmt(data.gross_revenue)}    color="#e8620a" />
            <StatCard label="Net Revenue"      value={fmt(data.net_revenue)}      color="#22c55e" />
            <StatCard label="Pending Payments" value={fmt(data.pending_payments)} color="#f59e0b"
              sub="Awaiting capture" />
            <StatCard label="Total Refunded"   value={fmt(data.refunded)}         color="#ef4444" />
            <StatCard label="Coupon Discounts" value={fmt(data.coupon_discounts)} color="#8b5cf6" />
            <StatCard label="Platform Fees"    value={fmt(data.platform_fees)}    color="#64748b"
              sub="Est. Razorpay 2.36%" />
          </div>

          {/* Revenue breakdown */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            Revenue by Channel
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 24 }}>
            <StatCard label="Event Registrations"  value={fmt(data.event_revenue)}       href="/admin/events/registrations" />
            <StatCard label="Memberships"           value={fmt(data.membership_revenue)}  href="/admin/membership" />
            <StatCard label="Merchandise"           value={fmt(data.merchandise_revenue)} href="/admin/merchandise" />
            <StatCard label="Donations"             value={fmt(data.donation_revenue)}    href="/admin/donations" />
            <StatCard label="Sponsorships Received" value={fmt(data.sponsor_revenue)}     href="/admin/sponsors/packages" />
            <StatCard label="Manual / Offline"      value={fmt(data.manual_payments)}     href="/admin/finance/manual-payments" />
          </div>

          {/* Payouts */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            Payouts
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            <StatCard label="Payouts Pending" value={fmt(data.payouts_pending)} color="#f59e0b" href="/admin/finance/payouts" />
            <StatCard label="Payouts Paid"    value={fmt(data.payouts_paid)}    color="#22c55e" href="/admin/finance/payouts" />
          </div>

          {/* Quick links */}
          <div style={{ marginTop: 32, padding: "16px 20px", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { label: "Reports & Export",    href: "/admin/finance/reports" },
              { label: "Manual Payments",     href: "/admin/finance/manual-payments" },
              { label: "Payouts",             href: "/admin/finance/payouts" },
              { label: "Financial Audit Log", href: "/admin/finance/audit-log" },
              { label: "Invoice List",        href: "/admin/finance" },
              { label: "Settlement",          href: "/admin/finance?tab=settlement" },
              { label: "Payment Investigate", href: "/admin/payment-reconcile" },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{
                fontSize: 12, color: "#666", textDecoration: "none", padding: "6px 12px",
                border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6,
              }}>{l.label} →</Link>
            ))}
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: 60, color: "#555" }}>Failed to load data.</div>
      )}
    </div>
  );
}
