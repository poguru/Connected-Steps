"use client";

import { useState, useEffect, useCallback } from "react";

interface Coupon {
  id: string; code: string; discount_type: "flat" | "percent"; discount_value: number;
  min_amount: number | null; max_uses: number | null; expires_at: string | null;
  description: string | null; use_count: number; is_active: boolean; created_at: string;
}

const ACCENT = "#e8620a";
const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16 };
const INPUT: React.CSSProperties = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };

type CouponForm = { code: string; discount_type: "flat" | "percent"; discount_value: string; min_amount: string; max_uses: string; expires_at: string; label: string };
const EMPTY: CouponForm = { code: "", discount_type: "flat", discount_value: "", min_amount: "", max_uses: "", expires_at: "", label: "" };

export default function CouponsPage() {
  const [coupons,  setCoupons]  = useState<Coupon[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<CouponForm>(EMPTY);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/it-run/admin/coupons");
      const d   = await res.json();
      setCoupons(d.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCoupon() {
    setSaving(true);
    setError("");
    try {
      const body = {
        code:           form.code,
        discount_type:  form.discount_type,
        discount_value: Number(form.discount_value),
        min_amount:     form.min_amount   ? Number(form.min_amount)  : undefined,
        max_uses:       form.max_uses     ? Number(form.max_uses)    : undefined,
        expires_at:     form.expires_at   || undefined,
        label:          form.label        || undefined,
      };
      const res = await fetch("/api/it-run/admin/coupons", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to create coupon"); return; }
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleCoupon(id: string, is_active: boolean) {
    await fetch("/api/it-run/admin/coupons", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, is_active }),
    });
    await load();
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Coupon Codes</h1>
          <div style={{ fontSize: 13, color: "#888" }}>{coupons.filter(c => c.is_active).length} active / {coupons.length} total</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ padding: "9px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {showForm ? "Cancel" : "+ Create Coupon"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...CARD, marginBottom: 20, border: `1px solid ${ACCENT}40` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New Coupon Code</div>
          {error && <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Code (uppercase)</div>
              <input style={{ ...INPUT, textTransform: "uppercase" }} placeholder="ITRUN50" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Discount Type</div>
              <select style={INPUT} value={form.discount_type}
                onChange={e => {
                  const v = e.target.value as "flat" | "percent";
                  setForm(f => ({ ...f, discount_type: v }));
                }}>
                <option value="flat">Flat (Rs.)</option>
                <option value="percent">Percent (%)</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Discount Value</div>
              <input type="number" min={1} style={INPUT} placeholder={form.discount_type === "flat" ? "100" : "10"} value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Min Order Amount</div>
              <input type="number" min={0} style={INPUT} placeholder="0 (no min)" value={form.min_amount} onChange={e => setForm(f => ({ ...f, min_amount: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Max Uses (blank=unlimited)</div>
              <input type="number" min={1} style={INPUT} placeholder="Unlimited" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Expires At</div>
              <input type="datetime-local" style={INPUT} value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Internal Label (optional)</div>
            <input style={INPUT} placeholder="e.g. IT company employee discount" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>
          <button onClick={createCoupon} disabled={saving || !form.code || !form.discount_value}
            style={{ padding: "9px 18px", background: saving ? "rgba(255,255,255,0.1)" : ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Creating..." : "Create Coupon"}
          </button>
        </div>
      )}

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {coupons.map(c => {
            const uses   = c.use_count ?? 0;
            const isFull = c.max_uses !== null && uses >= c.max_uses;
            return (
              <div key={c.id} style={{ ...CARD, opacity: c.is_active ? 1 : 0.5 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                      <code style={{ fontSize: 15, fontWeight: 900, color: ACCENT, letterSpacing: "0.1em" }}>{c.code}</code>
                      {c.description && <span style={{ fontSize: 12, color: "#888" }}>{c.description}</span>}
                      {!c.is_active && <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>DISABLED</span>}
                      {isFull && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>EXHAUSTED</span>}
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>
                        {c.discount_type === "flat" ? `Rs.${c.discount_value} off` : `${c.discount_value}% off`}
                      </span>
                      {c.min_amount && <span style={{ fontSize: 12, color: "#888" }}>Min: Rs.{c.min_amount}</span>}
                      <span style={{ fontSize: 12, color: "#888" }}>
                        Uses: <b style={{ color: "#ccc" }}>{uses}</b>{c.max_uses ? `/${c.max_uses}` : ""}
                      </span>
                      {c.expires_at && (
                        <span style={{ fontSize: 12, color: new Date(c.expires_at) < new Date() ? "#ef4444" : "#888" }}>
                          Exp: {new Date(c.expires_at).toLocaleDateString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => toggleCoupon(c.id, !c.is_active)}
                    style={{ padding: "6px 12px", background: c.is_active ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${c.is_active ? "#ef4444" : "#10b981"}40`, borderRadius: 8, color: c.is_active ? "#f87171" : "#10b981", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    {c.is_active ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            );
          })}
          {coupons.length === 0 && <div style={{ color: "#888", textAlign: "center", padding: 40 }}>No coupons created yet</div>}
        </div>
      )}
    </div>
  );
}
