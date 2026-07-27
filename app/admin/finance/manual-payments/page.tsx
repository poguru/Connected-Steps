"use client";

import { useState, useEffect, useCallback } from "react";

interface ManualPayment {
  id: string;
  user_name: string;
  user_email: string;
  entity_type: string;
  amount_paise: number;
  payment_method: string;
  payment_reference: string | null;
  payment_date: string;
  recorded_by: string;
  verified: boolean;
  notes: string | null;
  created_at: string;
}

const METHODS = ["cash", "bank_transfer", "upi", "cheque", "other"] as const;
const ENTITY_TYPES = ["registration", "membership", "merchandise", "donation", "sponsorship", "other"] as const;

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function ManualPaymentsPage() {
  const [records,  setRecords]  = useState<ManualPayment[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const [form, setForm] = useState({
    organization_id: "00000000-0000-0000-0000-000000000001",
    user_email: "", user_name: "", amount_rupees: "",
    payment_method: "cash", payment_reference: "", payment_date: new Date().toISOString().slice(0, 10),
    entity_type: "other", notes: "", recorded_by: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/finance/manual-payments?page=${page}`);
    if (res.ok) {
      const j = await res.json();
      setRecords(j.records);
      setTotal(j.total);
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
    const res = await fetch("/api/admin/finance/manual-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount_rupees: parseFloat(form.amount_rupees) }),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setForm(f => ({ ...f, user_email: "", user_name: "", amount_rupees: "", notes: "", payment_reference: "" }));
      void load();
    } else {
      alert("Failed to save");
    }
  }

  async function verify(id: string, verified_by: string) {
    await fetch("/api/admin/finance/manual-payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, verified: true, verified_by }),
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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Manual Payments</h1>
          <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>Cash, bank transfer, UPI offline payments — {total} total</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{
          background: "#e8620a", border: "none", borderRadius: 8, color: "#fff",
          fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit",
        }}>
          + Record Payment
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>Record Manual Payment</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { key: "user_email",        label: "User Email *",       type: "email" },
              { key: "user_name",         label: "User Name *",        type: "text" },
              { key: "amount_rupees",     label: "Amount (₹) *",       type: "number" },
              { key: "payment_reference", label: "Reference / UTR",    type: "text" },
              { key: "payment_date",      label: "Payment Date *",     type: "date" },
              { key: "recorded_by",       label: "Recorded By (email)*",type: "email" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} value={String(form[f.key as keyof typeof form])}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Payment Method *</label>
              <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                style={{ ...inputStyle }}>
                {METHODS.map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Entity Type</label>
              <select value={form.entity_type} onChange={e => setForm(p => ({ ...p, entity_type: e.target.value }))}
                style={{ ...inputStyle }}>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                style={{ ...inputStyle, height: 64, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={saving}
              style={{ background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Record"}
            </button>
            <button onClick={() => setShowForm(false)} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#555",
              fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>Loading…</div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#444" }}>No manual payments recorded yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Name","Email","Type","Amount","Method","Reference","Date","Verified","Recorded by"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 12px", color: "#ccc" }}>{r.user_name}</td>
                  <td style={{ padding: "10px 12px", color: "#666", fontSize: 11 }}>{r.user_email}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, color: "#888" }}>{r.entity_type}</span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#e8620a", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(r.amount_paise)}</td>
                  <td style={{ padding: "10px 12px", color: "#888", textTransform: "capitalize" }}>{r.payment_method.replace("_", " ")}</td>
                  <td style={{ padding: "10px 12px", color: "#555", fontFamily: "monospace", fontSize: 11 }}>{r.payment_reference ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#666" }}>{r.payment_date}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.verified ? (
                      <span style={{ color: "#22c55e", fontSize: 12 }}>✓ Verified</span>
                    ) : (
                      <button onClick={() => {
                        const by = prompt("Your email (verifier):");
                        if (by) void verify(r.id, by);
                      }} style={{
                        background: "none", border: "1px solid #f59e0b", borderRadius: 4, color: "#f59e0b",
                        fontSize: 11, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit",
                      }}>Verify</button>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#555", fontSize: 11 }}>{r.recorded_by}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > 50 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>← Prev</button>
              <span style={{ fontSize: 12, color: "#555", padding: "6px 14px" }}>Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={records.length < 50}
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
