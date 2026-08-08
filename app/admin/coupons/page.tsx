"use client";

import { useState, useEffect, useCallback } from "react";

interface Coupon {
  id:                 string;
  code:               string;
  description:        string | null;
  discount_type:      "percentage" | "fixed";
  discount_value:     number;
  assigned_to_email:  string | null;
  event_id:           string | null;
  max_uses:           number;
  use_count:          number;
  expires_at:         string | null;
  created_at:         string;
  coupon_uses:        { count: number }[];
}

interface Event { id: string; name: string; }

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 16,
};
const INP: React.CSSProperties = {
  padding: "9px 12px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

type Mode = "shared" | "unique";
interface Form {
  mode:           Mode;
  code:           string;
  prefix:         string;
  emails:         string;
  description:    string;
  discount_type:  "percentage" | "fixed";
  discount_value: string;
  max_uses:       string;
  event_id:       string;
  expires_at:     string;
}
const EMPTY: Form = {
  mode: "shared", code: "", prefix: "CS", emails: "",
  description: "", discount_type: "percentage", discount_value: "",
  max_uses: "", event_id: "", expires_at: "",
};

function randomCode(prefix: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = prefix ? prefix.toUpperCase() + "-" : "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export default function CouponsPage() {
  const [coupons,  setCoupons]  = useState<Coupon[]>([]);
  const [events,   setEvents]   = useState<Event[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<Form>(EMPTY);
  const [error,    setError]    = useState("");
  const [copied,   setCopied]   = useState<string | null>(null);
  const [filter,   setFilter]   = useState<"all" | "active" | "expired">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, eRes] = await Promise.all([
      fetch("/api/admin/coupons"),
      fetch("/api/admin/events?limit=200&status=published"),
    ]);
    if (cRes.ok) { const d = await cRes.json(); setCoupons(d.data ?? []); }
    if (eRes.ok) { const d = await eRes.json(); setEvents(d.events ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function f(k: keyof Form, v: string) { setForm(prev => ({ ...prev, [k]: v })); }

  function autoGenCode() { f("code", randomCode(form.prefix || "CS")); }

  async function create() {
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = {
        type:           form.mode,
        description:    form.description || undefined,
        discount_type:  form.discount_type,
        discount_value: Number(form.discount_value),
        max_uses:       form.max_uses ? Number(form.max_uses) : undefined,
        event_id:       form.event_id  || undefined,
        expires_at:     form.expires_at || undefined,
      };
      if (form.mode === "shared") {
        body.code = form.code.toUpperCase().trim();
      } else {
        body.prefix = form.prefix || "CS";
        body.emails = form.emails.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
      }
      const res = await fetch("/api/admin/coupons", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to create coupon"); return; }
      setForm(EMPTY); setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function deleteCoupon(id: string, code: string) {
    if (!confirm(`Delete coupon ${code}? This cannot be undone.`)) return;
    await fetch("/api/admin/coupons", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  const now = new Date();
  const displayed = coupons.filter(c => {
    if (filter === "active")  return !c.expires_at || new Date(c.expires_at) > now;
    if (filter === "expired") return !!c.expires_at && new Date(c.expires_at) <= now;
    return true;
  });

  const eventMap = new Map(events.map(e => [e.id, e.name]));

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>Coupon Codes</h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "#555" }}>
            Universal discount codes — work across any event or platform-wide
          </p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setError(""); setForm(EMPTY); }}
          style={{ padding: "9px 18px", background: showForm ? "transparent" : "#e8620a", border: showForm ? "1px solid rgba(255,255,255,0.15)" : "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {showForm ? "Cancel" : "+ New Coupon"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ ...CARD, marginBottom: 20, borderColor: "rgba(232,98,10,0.3)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>New Coupon Code</div>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["shared", "unique"] as Mode[]).map(m => (
              <button key={m} onClick={() => f("mode", m)}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: form.mode === m ? "rgba(232,98,10,0.15)" : "transparent",
                  borderColor: form.mode === m ? "#e8620a" : "rgba(255,255,255,0.12)",
                  color: form.mode === m ? "#e8620a" : "#888" }}>
                {m === "shared" ? "Shared Code" : "Unique Per Email"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 16 }}>
            {form.mode === "shared"
              ? "One code shared by many — useful for promotions. Set max uses to limit redemptions."
              : "Auto-generate a unique code per email address — one use each."}
          </div>

          {error && <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 12, marginBottom: 14 }}>{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>

            {/* Shared: manual code */}
            {form.mode === "shared" && (
              <div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Code</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...INP, textTransform: "uppercase", flex: 1 }}
                    placeholder="e.g. SUMMER20"
                    value={form.code}
                    onChange={e => f("code", e.target.value.toUpperCase())} />
                  <button onClick={autoGenCode}
                    style={{ padding: "0 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    Auto
                  </button>
                </div>
              </div>
            )}

            {/* Unique: prefix */}
            {form.mode === "unique" && (
              <div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Code Prefix</div>
                <input style={{ ...INP, textTransform: "uppercase" }}
                  placeholder="CS" value={form.prefix}
                  onChange={e => f("prefix", e.target.value.toUpperCase())} />
              </div>
            )}

            {/* Discount type */}
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Discount Type</div>
              <select style={INP} value={form.discount_type}
                onChange={e => f("discount_type", e.target.value as "percentage" | "fixed")}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>

            {/* Discount value */}
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                {form.discount_type === "percentage" ? "Discount %" : "Discount ₹"}
              </div>
              <input type="number" min={1} style={INP}
                placeholder={form.discount_type === "percentage" ? "10" : "100"}
                value={form.discount_value}
                onChange={e => f("discount_value", e.target.value)} />
            </div>

            {/* Max uses (shared only) */}
            {form.mode === "shared" && (
              <div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Max Uses (blank = unlimited)</div>
                <input type="number" min={1} style={INP} placeholder="Unlimited"
                  value={form.max_uses} onChange={e => f("max_uses", e.target.value)} />
              </div>
            )}

            {/* Event scope */}
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Event (optional — leave blank for all events)</div>
              <select style={INP} value={form.event_id} onChange={e => f("event_id", e.target.value)}>
                <option value="">All Events (Universal)</option>
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            {/* Expiry */}
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Expires At (optional)</div>
              <input type="datetime-local" style={INP}
                value={form.expires_at} onChange={e => f("expires_at", e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Internal Description (optional)</div>
            <input style={INP} placeholder="e.g. Early-bird 10% off for marathon registrations"
              value={form.description} onChange={e => f("description", e.target.value)} />
          </div>

          {/* Unique: email list */}
          {form.mode === "unique" && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                Email Addresses (one per line, or comma-separated) — one code generated per email
              </div>
              <textarea rows={6} style={{ ...INP, resize: "vertical" }}
                placeholder={"user1@example.com\nuser2@example.com\nuser3@example.com"}
                value={form.emails} onChange={e => f("emails", e.target.value)} />
              <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                {form.emails.split(/[\n,;]+/).filter(e => e.trim()).length} email(s) entered
              </div>
            </div>
          )}

          <button onClick={create}
            disabled={saving || !form.discount_value || (form.mode === "shared" ? !form.code : !form.emails.trim())}
            style={{ padding: "9px 20px", background: saving ? "rgba(255,255,255,0.08)" : "#e8620a", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Creating…" : form.mode === "shared" ? "Create Coupon" : `Generate ${form.emails.split(/[\n,;]+/).filter(e => e.trim()).length} Codes`}
          </button>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#555" }}>
          <span style={{ color: "#fff", fontWeight: 700 }}>{coupons.length}</span> total &nbsp;·&nbsp;
          <span style={{ color: "#10b981", fontWeight: 700 }}>{coupons.filter(c => !c.expires_at || new Date(c.expires_at) > now).length}</span> active
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {(["all", "active", "expired"] as const).map(f_ => (
            <button key={f_} onClick={() => setFilter(f_)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid", fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: filter === f_ ? "rgba(232,98,10,0.12)" : "transparent",
                borderColor: filter === f_ ? "#e8620a" : "rgba(255,255,255,0.1)",
                color: filter === f_ ? "#e8620a" : "#666" }}>
              {f_.charAt(0).toUpperCase() + f_.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Coupon list */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#555" }}>Loading…</div>
      ) : displayed.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center", padding: "3rem", color: "#555" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏷️</div>
          <div style={{ fontWeight: 600, color: "#888", marginBottom: 8 }}>No coupons yet</div>
          <div style={{ fontSize: 12 }}>Create a shared code or generate unique codes per email</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {displayed.map(c => {
            const uses    = c.coupon_uses?.[0]?.count ?? c.use_count ?? 0;
            const isExpired = c.expires_at && new Date(c.expires_at) <= now;
            const isFull    = c.max_uses && uses >= c.max_uses;
            const statusColor = isExpired ? "#f87171" : isFull ? "#f59e0b" : "#10b981";
            const statusLabel = isExpired ? "Expired" : isFull ? "Exhausted" : "Active";

            return (
              <div key={c.id} style={{ ...CARD, opacity: isExpired ? 0.6 : 1 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      <code style={{ fontSize: 15, fontWeight: 900, color: "#e8620a", letterSpacing: "0.1em", fontFamily: "monospace" }}>
                        {c.code}
                      </code>
                      <button onClick={() => copyCode(c.code)}
                        style={{ padding: "2px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: copied === c.code ? "#10b981" : "#888", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                        {copied === c.code ? "Copied!" : "Copy"}
                      </button>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {statusLabel}
                      </span>
                      {c.assigned_to_email && (
                        <span style={{ fontSize: 10, color: "#60a5fa", background: "rgba(96,165,250,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(96,165,250,0.15)" }}>
                          {c.assigned_to_email}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: "#34d399", fontWeight: 700 }}>
                        {c.discount_type === "percentage" ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                      </span>
                      <span style={{ color: "#888" }}>
                        Uses: <b style={{ color: "#ccc" }}>{uses}</b>
                        {c.max_uses ? `/${c.max_uses}` : " (unlimited)"}
                      </span>
                      <span style={{ color: "#888" }}>
                        Scope: <b style={{ color: "#ccc" }}>
                          {c.event_id ? (eventMap.get(c.event_id) ?? "Specific Event") : "All Events"}
                        </b>
                      </span>
                      {c.expires_at && (
                        <span style={{ color: isExpired ? "#f87171" : "#888" }}>
                          Exp: {new Date(c.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                      {c.description && <span style={{ color: "#555", fontStyle: "italic" }}>{c.description}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteCoupon(c.id, c.code)}
                    style={{ padding: "6px 12px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
