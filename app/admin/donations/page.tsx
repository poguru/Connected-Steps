"use client";

import { useState, useEffect, useCallback } from "react";

interface Donation {
  id: string;
  user_name: string;
  user_email: string;
  amount_paise: number;
  amount_rupees: number;
  campaign: string;
  beneficiary: string | null;
  payment_method: string;
  tax_receipt_number: string | null;
  tax_receipt_sent: boolean;
  notes: string | null;
  created_at: string;
}

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
function fmtR(r: number) {
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const METHODS = ["razorpay","cash","bank_transfer","upi","cheque"] as const;

export default function DonationsPage() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [total,     setTotal]     = useState(0);
  const [totalAmt,  setTotalAmt]  = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [form, setForm] = useState({
    organization_id: "00000000-0000-0000-0000-000000000001",
    user_email: "", user_name: "", phone: "",
    amount_rupees: "", campaign: "general", beneficiary: "",
    payment_method: "cash", notes: "", recorded_by: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/donations?page=${page}`);
    if (res.ok) {
      const j = await res.json();
      setDonations(j.donations ?? []);
      setTotal(j.total_records ?? 0);
      setTotalAmt(j.total_rupees ?? 0);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!form.user_email || !form.user_name || !form.amount_rupees || !form.recorded_by) {
      alert("Fill all required fields");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount_rupees: parseFloat(form.amount_rupees) }),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setForm(f => ({ ...f, user_email: "", user_name: "", phone: "", amount_rupees: "", notes: "", campaign: "general" }));
      void load();
    } else {
      alert("Failed to save");
    }
  }

  async function markReceiptSent(id: string) {
    await fetch("/api/admin/donations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tax_receipt_sent: true }),
    });
    void load();
  }

  const inputStyle: React.CSSProperties = {
    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "inherit", width: "100%", outline: "none",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Donations</h1>
          <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>
            {total} donations · Total: <span style={{ color: "#22c55e" }}>{fmtR(totalAmt)}</span>
          </p>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{
          background: "#e8620a", border: "none", borderRadius: 8, color: "#fff",
          fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit",
        }}>+ Record Donation</button>
      </div>

      {showForm && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>Record Donation</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { key: "user_email",    label: "Donor Email *",   type: "email" },
              { key: "user_name",     label: "Donor Name *",    type: "text" },
              { key: "phone",         label: "Phone",           type: "tel" },
              { key: "amount_rupees", label: "Amount (₹) *",   type: "number" },
              { key: "campaign",      label: "Campaign",        type: "text" },
              { key: "beneficiary",   label: "Beneficiary",     type: "text" },
              { key: "recorded_by",   label: "Recorded by (email) *", type: "email" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} value={String(form[f.key as keyof typeof form])}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Payment Method</label>
              <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} style={inputStyle}>
                {METHODS.map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
              </select>
            </div>
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
            }}>{saving ? "Saving…" : "Record Donation"}</button>
            <button onClick={() => setShowForm(false)} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#555",
              fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>Loading…</div>
      ) : donations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No donations recorded yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Donor","Amount","Campaign","Method","Receipt #","Receipt Sent","Date"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {donations.map(d => (
                <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ color: "#ccc", fontWeight: 500 }}>{d.user_name}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{d.user_email}</div>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#22c55e", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(d.amount_paise)}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{d.campaign}</td>
                  <td style={{ padding: "10px 12px", color: "#666", textTransform: "capitalize" }}>{d.payment_method.replace("_", " ")}</td>
                  <td style={{ padding: "10px 12px", color: "#555", fontFamily: "monospace", fontSize: 11 }}>
                    {d.tax_receipt_number ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {d.tax_receipt_sent ? (
                      <span style={{ color: "#22c55e", fontSize: 12 }}>✓ Sent</span>
                    ) : (
                      <button onClick={() => markReceiptSent(d.id)} style={{
                        background: "none", border: "1px solid #3b82f6", borderRadius: 4, color: "#3b82f6",
                        fontSize: 11, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit",
                      }}>Mark Sent</button>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#555", fontSize: 11 }}>{d.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > 50 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>← Prev</button>
              <span style={{ fontSize: 12, color: "#555", padding: "6px 14px" }}>Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={donations.length < 50}
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
