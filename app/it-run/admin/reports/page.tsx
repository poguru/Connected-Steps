"use client";

const ACCENT = "#e8620a";

const REPORTS = [
  {
    type:    "registrations",
    title:   "Registrations Report",
    desc:    "All registrations with payment status, category, lead email, price, and coupon info",
    fields:  "Reg Code, Category, Lead Email, Participants, Base Price, Discount, Final Price, Payment Status, Coupon, Date",
    color:   "#6366f1",
  },
  {
    type:    "participants",
    title:   "Participants Report",
    desc:    "All individual participants with BIB numbers, T-shirt sizes, company info, and verification status",
    fields:  "Reg Code, Category, Name, Email, Mobile, Type, DOB, T-Shirt, Company, Employee ID, Verification, BIB, Wave, Collected",
    color:   ACCENT,
  },
  {
    type:    "revenue",
    title:   "Revenue Report",
    desc:    "Financial summary — paid and free registrations with coupon discounts applied",
    fields:  "Date, Reg Code, Category, Participants, Base Price, Discount, Final Price, Payment ID, Status",
    color:   "#10b981",
  },
  {
    type:    "checkin",
    title:   "Check-in Report",
    desc:    "All participants who checked in on event day with timestamps",
    fields:  "Reg Code, Category, Name, BIB, Check-in Time, Staff Notes",
    color:   "#f59e0b",
  },
];

export default function ReportsPage() {
  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Reports & Exports</h1>
        <div style={{ fontSize: 13, color: "#888" }}>Download CSV files for offline analysis, printing, or sharing</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {REPORTS.map(r => (
          <div key={r.type}
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{r.title}</div>
                <div style={{ fontSize: 13, color: "#aaa", marginBottom: 8 }}>{r.desc}</div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  <span style={{ color: "#555", fontWeight: 600 }}>Fields: </span>
                  {r.fields}
                </div>
              </div>
              <a href={`/api/it-run/admin/reports?type=${r.type}`} download
                style={{
                  padding: "10px 18px", background: `${r.color}15`,
                  border: `1px solid ${r.color}40`, borderRadius: 10,
                  color: r.color, fontSize: 13, fontWeight: 700,
                  textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                Download CSV
              </a>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          <strong style={{ color: "#888" }}>Note:</strong> Reports reflect the current database state at the time of download.
          For event-day operations, use the dedicated BIB Collection and Check-in portals.
          All CSV files are UTF-8 encoded and compatible with Excel and Google Sheets.
        </div>
      </div>
    </div>
  );
}
