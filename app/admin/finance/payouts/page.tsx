"use client";

import { useState, useEffect, useCallback } from "react";

interface Payout {
  id: string;
  payee_name: string;
  payee_email: string | null;
  payee_type: string;
  category: string;
  amount_paise: number;
  amount_rupees: number;
  description: string;
  payment_method: string;
  status: string;
  payment_date: string | null;
  paid_by: string | null;
  created_at: string;
  events?: { title: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending:    "#f59e0b",
  processing: "#3b82f6",
  paid:       "#22c55e",
  failed:     "#ef4444",
  cancelled:  "#6b7280",
};

const PAYEE_TYPES   = ["vendor","coach","volunteer","sponsor","service_provider","other"] as const;
const CATEGORIES    = ["coaching","venue","logistics","catering","photography","timing","prize","merchandise","other"] as const;
const PAY_METHODS   = ["bank_transfer","upi","cash","cheque"] as const;

function fmt(r: number) {
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function PayoutsPage() {
  const [payouts,   setPayouts]   = useState<Payout[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [statusFilt,setStatusFilt]= useState("");

  const [form, setForm] = useState({
    organization_id: "00000000-0000-0000-0000-000000000001",
    payee_type: "vendor", payee_name: "", payee_email: "", payee_phone: "", payee_account: "",
    amount_rupees: "", description: "", category: "other",
    payment_method: "bank_transfer", notes: "", paid_by: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilt) params.set("status", statusFilt);
    const res = await fetch(`/api/admin/finance/payouts?${params}`);
    if (res.ok) {
      const j = await res.json();
      setPayouts(j.payouts);
      setTotal(j.total);
    }
    setLoading(false);
  }, [page, statusFilt]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!form.payee_name || !form.amount_rupees || !form.description || !form.paid_by) {
      alert("Fill all required fields");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/finance/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount_rupees: parseFloat(form.amount_rupees) }),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      void load();
    } else {
      alert("Failed to save");
    }
  }

  async function markPaid(id: string) {
    const ref = prompt("Payment reference (UTR/cheque no):");
    const by  = prompt("Your email:");
    if (!by) return;
    await fetch("/api/admin/finance/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "paid", payment_reference: ref, payment_date: new Date().toISOString().slice(0, 10), paid_by: by }),
    });
    void load();
  }

  const inputStyle: React.CSSProperties = {
    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", width: "100%", outline: "none",
  };
  const selStyle = inputStyle;

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Payouts</h1>
          <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Track outgoing payments — {total} total</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={statusFilt} onChange={e => { setStatusFilt(e.target.value); setPage(1); }}
            style={{ ...selStyle, width: "auto" }}>
            <option value="">All statuses</option>
            {["pending","processing","paid","failed","cancelled"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={() => setShowForm(s => !s)} style={{
            background: "#e8620a", border: "none", borderRadius: 8, color: "#fff",
            fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit",
          }}>+ Add Payout</button>
        </div>
      </div>

      {showForm && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>New Payout</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { key: "payee_name",    label: "Payee Name *",        type: "text" },
              { key: "payee_email",   label: "Payee Email",         type: "email" },
              { key: "payee_phone",   label: "Payee Phone",         type: "tel" },
              { key: "payee_account", label: "Bank Account / UPI",  type: "text" },
              { key: "amount_rupees", label: "Amount (₹) *",        type: "number" },
              { key: "description",   label: "Description *",       type: "text" },
              { key: "paid_by",       label: "Initiated By (email)*",type: "email" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} value={String(form[f.key as keyof typeof form])}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            {[
              { key: "payee_type",    label: "Payee Type",  opts: PAYEE_TYPES },
              { key: "category",      label: "Category",    opts: CATEGORIES },
              { key: "payment_method",label: "Method",      opts: PAY_METHODS },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                <select value={String(form[f.key as keyof typeof form])}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={selStyle}>
                  {f.opts.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                style={{ ...inputStyle, height: 60, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={saving} style={{
              background: "#e8620a", border: "none", borderRadius: 6, color: "#fff",
              fontSize: 13, fontWeight: 600, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1,
            }}>{saving ? "Saving…" : "Create Payout"}</button>
            <button onClick={() => setShowForm(false)} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#555",
              fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>Loading…</div>
      ) : payouts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No payouts yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Payee","Type","Amount","Category","Method","Status","Created","Actions"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ color: "#ccc", fontWeight: 500 }}>{p.payee_name}</div>
                    {p.payee_email && <div style={{ fontSize: 11, color: "#555" }}>{p.payee_email}</div>}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, color: "#888", textTransform: "capitalize" }}>{p.payee_type.replace("_", " ")}</span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#e8620a", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(p.amount_rupees)}</td>
                  <td style={{ padding: "10px 12px", color: "#666", textTransform: "capitalize" }}>{p.category}</td>
                  <td style={{ padding: "10px 12px", color: "#666", textTransform: "capitalize" }}>{p.payment_method.replace("_", " ")}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, color: STATUS_COLORS[p.status] ?? "#888", border: `1px solid ${STATUS_COLORS[p.status] ?? "#888"}` }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#555", fontSize: 11 }}>{p.created_at.slice(0, 10)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {p.status === "pending" && (
                      <button onClick={() => markPaid(p.id)} style={{
                        background: "none", border: "1px solid #22c55e", borderRadius: 4, color: "#22c55e",
                        fontSize: 11, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit",
                      }}>Mark Paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 50 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>← Prev</button>
              <span style={{ fontSize: 12, color: "#555", padding: "6px 14px" }}>Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={payouts.length < 50} style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
