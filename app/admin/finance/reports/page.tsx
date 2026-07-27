"use client";

import { useState } from "react";

const REPORTS = [
  { id: "registrations",  label: "Event Registrations", desc: "All paid registrations with coupon usage" },
  { id: "refunds",        label: "Refunds",             desc: "All refunded registrations" },
  { id: "coupons",        label: "Coupons",             desc: "Coupon inventory and usage stats" },
  { id: "invoices",       label: "Invoices",            desc: "GST Bill of Supply log" },
  { id: "memberships",    label: "Memberships",         desc: "Active and past memberships" },
  { id: "merchandise",    label: "Merchandise",         desc: "Merchandise orders" },
  { id: "donations",      label: "Donations",           desc: "Donation records with tax receipts" },
  { id: "sponsors",       label: "Sponsorships",        desc: "Sponsor agreement tracker" },
  { id: "payouts",        label: "Payouts",             desc: "Outgoing payments to vendors, coaches, volunteers" },
  { id: "manual_payments",label: "Manual Payments",     desc: "Cash, UPI, bank transfer records" },
] as const;

type ReportId = (typeof REPORTS)[number]["id"];

export default function FinanceReports() {
  const [selected, setSelected] = useState<ReportId>("registrations");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [orgId,    setOrgId]    = useState("");
  const [eventId,  setEventId]  = useState("");
  const [loading,  setLoading]  = useState(false);

  async function download(format: "csv" | "json") {
    setLoading(true);
    const params = new URLSearchParams({ report: selected, format });
    if (orgId)    params.set("org_id",    orgId);
    if (eventId)  params.set("event_id",  eventId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo)   params.set("date_to",   dateTo);

    const res = await fetch(`/api/admin/finance/reports?${params}`);
    if (!res.ok) { setLoading(false); return; }

    const blob     = await res.blob();
    const filename = `cs-${selected}-${new Date().toISOString().slice(0, 10)}.${format}`;
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
  }

  const inputStyle: React.CSSProperties = {
    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>Financial Reports</h1>
      <p style={{ fontSize: 13, color: "#555", margin: "0 0 28px" }}>Export CSV or JSON for any module</p>

      {/* Report selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 28 }}>
        {REPORTS.map(r => (
          <button key={r.id} onClick={() => setSelected(r.id)}
            style={{
              background: selected === r.id ? "rgba(232,98,10,0.12)" : "#111",
              border: `1px solid ${selected === r.id ? "#e8620a" : "rgba(255,255,255,0.07)"}`,
              borderRadius: 8, padding: "12px 14px", cursor: "pointer", textAlign: "left",
              fontFamily: "inherit",
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: selected === r.id ? "#e8620a" : "#ccc", marginBottom: 2 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 11, color: "#555" }}>{r.desc}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Filters (optional)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: "#444" }}>Date from</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: "#444" }}>Date to</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: "#444" }}>Org ID</label>
            <input placeholder="UUID" value={orgId} onChange={e => setOrgId(e.target.value)} style={{ ...inputStyle, width: 200 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: "#444" }}>Event ID</label>
            <input placeholder="UUID" value={eventId} onChange={e => setEventId(e.target.value)} style={{ ...inputStyle, width: 200 }} />
          </div>
        </div>
      </div>

      {/* Download actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => download("csv")}
          disabled={loading}
          style={{
            background: "#e8620a", border: "none", borderRadius: 8, color: "#fff",
            fontSize: 14, fontWeight: 700, padding: "12px 24px", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1, fontFamily: "inherit",
          }}>
          {loading ? "Generating…" : "Download CSV"}
        </button>
        <button
          onClick={() => download("json")}
          disabled={loading}
          style={{
            background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc",
            fontSize: 14, fontWeight: 600, padding: "12px 24px", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1, fontFamily: "inherit",
          }}>
          Download JSON
        </button>
      </div>

      <p style={{ fontSize: 11, color: "#333", marginTop: 16 }}>
        CSV files open in Excel/Google Sheets. JSON files can be used for further processing.
        Maximum 5,000 rows per export.
      </p>
    </div>
  );
}
