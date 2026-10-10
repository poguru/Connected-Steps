"use client";

import { useState, useEffect } from "react";

// Early Bird Offers (event_admin / super_admin). The server validates every change and decides every price.
// All times are entered and shown in the event timezone, Asia/Kolkata (IST).

interface Category { id: string; name: string; priceRupees: number; active: boolean }
interface Offer {
  id: string; name: string; category_id: string; category_name: string; base_price_rupees: number | null;
  discount_type: "percent" | "fixed"; discount_value: number; starts_at: string; ends_at: string;
  status: "draft" | "active" | "paused" | "archived"; live_state: string;
  redemption_limit: number | null; redemptions_used: number; quota_remaining: number | null;
  min_payable_rupees: number; notes: string | null; overlaps_with: string[];
}

const ACCENT = "#e8620a";
const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 12 };
const INPUT: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit" };
const BTN = (color: string, disabled = false): React.CSSProperties => ({ minHeight: 40, padding: "8px 14px", borderRadius: 8, background: `${color}18`, border: `1px solid ${color}55`, color, fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: "inherit" });

const STATE_COLOR: Record<string, string> = { running: "#10b981", scheduled: "#60a5fa", expired: "#888", sold_out: "#f59e0b", paused: "#f59e0b", draft: "#888", archived: "#555" };

// datetime-local gives "YYYY-MM-DDTHH:mm" with no zone; the event zone is IST (+05:30)
const toIst = (local: string) => (local ? `${local}:00+05:30` : "");
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function EarlyBirdAdminPage() {
  const [offers, setOffers]         = useState<Offer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [notice, setNotice]         = useState("");
  const [busy, setBusy]             = useState(false);
  const [reloadKey, setReloadKey]   = useState(0);

  const [form, setForm] = useState({
    name: "", category_id: "", discount_type: "percent", discount_value: "", starts: "", ends: "",
    redemption_limit: "", min_payable_rupees: "", status: "draft", notes: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/it-run/admin/early-bird", { cache: "no-store" });
        const d = await res.json() as { offers?: Offer[]; categories?: Category[]; error?: string };
        if (!active) return;
        if (!res.ok) { setError(d.error ?? "Could not load offers"); return; }
        setOffers(d.offers ?? []);
        setCategories(d.categories ?? []);
        setError("");
      } catch {
        if (active) setError("Network error while loading offers");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reloadKey]);

  async function create() {
    setBusy(true); setError(""); setNotice("");
    const res = await fetch("/api/it-run/admin/early-bird", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, category_id: form.category_id, discount_type: form.discount_type,
        discount_value: Number(form.discount_value), starts_at: toIst(form.starts), ends_at: toIst(form.ends),
        redemption_limit: form.redemption_limit === "" ? null : Number(form.redemption_limit),
        min_payable_rupees: form.min_payable_rupees === "" ? 0 : Number(form.min_payable_rupees),
        status: form.status, notes: form.notes,
      }),
    });
    const d = await res.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not create the offer"); return; }
    setNotice("Offer created.");
    setForm(f => ({ ...f, name: "", discount_value: "", starts: "", ends: "", redemption_limit: "", min_payable_rupees: "", notes: "" }));
    setReloadKey(k => k + 1);
  }

  async function setStatus(o: Offer, status: "active" | "paused" | "archived") {
    setBusy(true); setError(""); setNotice("");
    const res = await fetch("/api/it-run/admin/early-bird", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, status }),
    });
    const d = await res.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not change the status"); return; }
    setNotice(`${o.name} is now ${status}.`);
    setReloadKey(k => k + 1);
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Early Bird Offers</h1>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 16px", lineHeight: 1.6 }}>
        Times are in IST (Asia/Kolkata). An offer applies only while it is active and inside its window, with places left.
        A redemption is one registration (booking). It is taken when the registration is made and given back if the registration fails, expires, or is refunded.
        Changing an offer never changes the price of a registration already made.
      </p>

      {error && <div role="alert" style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {notice && <div role="status" style={{ color: "#10b981", fontSize: 13, marginBottom: 12 }}>{notice}</div>}

      <div style={CARD}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12 }}>New offer</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <label style={{ fontSize: 12, color: "#aaa" }}>Name
            <input style={INPUT} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Early Bird — 5K Timed Run" />
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Category
            <select style={INPUT} value={form.category_id} onChange={e => set("category_id", e.target.value)}>
              <option value="">Choose…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} — {inr(c.priceRupees)}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Discount type
            <select style={INPUT} value={form.discount_type} onChange={e => set("discount_type", e.target.value)}>
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount (₹)</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Discount value
            <input style={INPUT} inputMode="numeric" value={form.discount_value} onChange={e => set("discount_value", e.target.value)} placeholder={form.discount_type === "percent" ? "e.g. 15 (max 90)" : "e.g. 50"} />
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Starts (IST)
            <input style={INPUT} type="datetime-local" value={form.starts} onChange={e => set("starts", e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Ends (IST)
            <input style={INPUT} type="datetime-local" value={form.ends} onChange={e => set("ends", e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Places (blank = no limit)
            <input style={INPUT} inputMode="numeric" value={form.redemption_limit} onChange={e => set("redemption_limit", e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Minimum payable (₹)
            <input style={INPUT} inputMode="numeric" value={form.min_payable_rupees} onChange={e => set("min_payable_rupees", e.target.value)} placeholder="0" />
          </label>
          <label style={{ fontSize: 12, color: "#aaa" }}>Start as
            <select style={INPUT} value={form.status} onChange={e => set("status", e.target.value)}>
              <option value="draft">Draft (not live)</option>
              <option value="active">Active</option>
            </select>
          </label>
        </div>
        <label style={{ fontSize: 12, color: "#aaa", display: "block", marginTop: 12 }}>Internal notes (optional)
          <textarea style={{ ...INPUT, minHeight: 60 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={create} disabled={busy} style={BTN(ACCENT, busy)}>Create offer</button>
        </div>
      </div>

      {loading && <div style={{ color: "#666", fontSize: 13 }}>Loading…</div>}
      {!loading && offers.length === 0 && <div style={{ color: "#666", fontSize: 13 }}>No offers yet.</div>}

      {offers.map(o => (
        <div key={o.id} style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{o.name}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{o.category_name} · base {o.base_price_rupees !== null ? inr(o.base_price_rupees) : "—"}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: STATE_COLOR[o.live_state] ?? "#888", alignSelf: "flex-start" }}>{o.live_state.replace("_", " ")}</span>
          </div>
          <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.7 }}>
            Discount: {o.discount_type === "percent" ? `${o.discount_value}%` : inr(o.discount_value)}
            {o.base_price_rupees !== null && <> → final {inr(o.discount_type === "percent"
              ? o.base_price_rupees - Math.floor((2 * o.base_price_rupees * o.discount_value + 100) / 200)
              : Math.max(o.min_payable_rupees, o.base_price_rupees - o.discount_value))}</>}
            <br />
            {fmt(o.starts_at)} → {fmt(o.ends_at)}
            <br />
            Places: {o.redemption_limit === null ? "no limit" : `${o.redemptions_used} of ${o.redemption_limit} used (${o.quota_remaining} left)`}
            {o.min_payable_rupees > 0 && <> · minimum payable {inr(o.min_payable_rupees)}</>}
          </div>
          {o.overlaps_with.length > 0 && (
            <div role="alert" style={{ fontSize: 12, color: "#f59e0b", marginTop: 8 }}>
              Overlaps another offer on this category. Only the larger discount applies where they overlap.
            </div>
          )}
          {o.notes && <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>Note: {o.notes}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {o.status !== "active" && o.status !== "archived" && (
              <button type="button" disabled={busy} onClick={() => setStatus(o, "active")} style={BTN("#10b981", busy)}>Activate</button>
            )}
            {o.status === "active" && (
              <button type="button" disabled={busy} onClick={() => setStatus(o, "paused")} style={BTN("#f59e0b", busy)}>Pause</button>
            )}
            {o.status !== "archived" && (
              <button type="button" disabled={busy} onClick={() => setStatus(o, "archived")} style={BTN("#888", busy)}>Archive</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
