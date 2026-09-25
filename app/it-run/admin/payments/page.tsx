"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";

type Reg = {
  id: string; registration_code: string; lead_email: string;
  payment_status: string; final_price: number; base_price: number;
  discount_amount: number; razorpay_order_id: string | null;
  razorpay_payment_id: string | null; created_at: string;
  confirmation_email_sent_at: string | null;
  it_run_categories: { name: string; color: string } | null;
};

const STATUS_COLOR: Record<string, string> = {
  paid: "#10b981", free: "#10b981", pending: "#f59e0b",
  payment_attempted: "#6366f1", failed: "#ef4444", expired: "#555",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", free: "Free", pending: "Pending", failed: "Failed",
  payment_attempted: "In Progress", expired: "Expired",
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? "#888";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
      background: `${c}18`, border: `1px solid ${c}30`, color: c }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const STATUSES = ["all","paid","free","pending","payment_attempted","failed","expired"];

export default function PaymentsPage() {
  const [rows,    setRows]    = useState<Reg[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState("all");
  const [q,       setQ]       = useState("");
  const [offset,  setOffset]  = useState(0);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, limit: String(LIMIT), offset: String(offset) });
    if (q) params.set("q", q);
    fetch(`/api/it-run/admin/payments?${params}`)
      .then(r => r.json())
      .then(d => { setRows(d.registrations ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, q, offset]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
  }

  const totalRevenue = rows
    .filter(r => r.payment_status === "paid")
    .reduce((s, r) => s + r.final_price, 0);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Payments</h1>
        <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>All registrations with payment status and Razorpay references.</p>
      </div>

      {/* Quick stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Pill label="Total shown" value={total} />
        <Pill label="Revenue (shown paid)" value={`₹${totalRevenue.toLocaleString("en-IN")}`} color="#60a5fa" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1, minWidth: 220 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, email, Razorpay ID…"
            style={{ flex: 1, padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button type="submit" style={{ padding: "9px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Search</button>
        </form>
        <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}
          style={{ padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
          {STATUSES.map(s => <option key={s} value={s} style={{ background: "#1a1a1a" }}>{s === "all" ? "All statuses" : STATUS_LABEL[s] ?? s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Code","Email","Category","Status","Amount","Discount","Razorpay Payment ID","Date","Email Sent"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#555" }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#555" }}>No records found</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: ACCENT, whiteSpace: "nowrap" }}>{r.registration_code}</td>
                  <td style={{ padding: "10px 14px", color: "#ccc", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{r.lead_email}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ color: r.it_run_categories?.color ?? ACCENT, fontWeight: 600 }}>{r.it_run_categories?.name ?? "—"}</span>
                  </td>
                  <td style={{ padding: "10px 14px" }}><StatusBadge status={r.payment_status} /></td>
                  <td style={{ padding: "10px 14px", color: "#10b981", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {r.final_price > 0 ? `₹${r.final_price.toLocaleString("en-IN")}` : "Free"}
                  </td>
                  <td style={{ padding: "10px 14px", color: r.discount_amount > 0 ? "#f59e0b" : "#555" }}>
                    {r.discount_amount > 0 ? `-₹${r.discount_amount.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", color: "#666", fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {r.razorpay_payment_id ?? "—"}
                  </td>
                  <td style={{ padding: "10px 14px", color: "#666", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {r.confirmation_email_sent_at
                      ? <span style={{ color: "#10b981", fontSize: 12 }}>✓ Sent</span>
                      : <span style={{ color: "#555", fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center", alignItems: "center" }}>
          <button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset === 0 ? "#444" : "#888", cursor: offset === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "#666" }}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <button disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset + LIMIT >= total ? "#444" : "#888", cursor: offset + LIMIT >= total ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 16px" }}>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color ?? "#fff", marginTop: 2 }}>{value}</div>
    </div>
  );
}
