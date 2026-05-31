"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface RunEvent {
  id: string; name: string; description: string; price: number;
  date: string; time: string; location: string; is_live: boolean; created_at: string;
}
interface Coupon {
  id: string; code: string; description: string; discount_type: string;
  discount_value: number; assigned_to_email: string | null; max_uses: number;
  use_count: number; expires_at: string | null; created_at: string;
}

const S: Record<string, React.CSSProperties> = {
  input: { width: "100%", padding: "10px 13px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" },
  label: { display: "block", fontSize: "11px", color: "#888", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: "5px" },
  btn: { padding: "10px 22px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" },
  card: { background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "1.5rem" },
};

export default function AdminEventsPage() {
  const [password, setPassword] = useState("");
  const [authed,   setAuthed]   = useState(false);
  const [authErr,  setAuthErr]  = useState("");
  const [tab,      setTab]      = useState<"events" | "coupons">("events");

  const [events,   setEvents]   = useState<RunEvent[]>([]);
  const [coupons,  setCoupons]  = useState<Coupon[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState("");

  // Event form
  const [ef, setEf] = useState({ name: "", description: "", price: "", date: "", time: "", location: "" });
  // Coupon form
  const [cf, setCf] = useState({
    type: "shared", code: "", prefix: "CS", emails: "",
    description: "", discount_type: "percentage", discount_value: "",
    max_uses: "999", event_id: "", expires_at: "",
  });

  const headers = { "Content-Type": "application/json", "x-admin-password": password };

  async function login(e: React.SyntheticEvent) {
    e.preventDefault(); setLoading(true); setAuthErr("");
    const res = await fetch("/api/admin/events", { headers: { "x-admin-password": password } });
    if (res.status === 401) { setAuthErr("Incorrect password."); setLoading(false); return; }
    const json = await res.json();
    setEvents(json.data ?? []);
    setAuthed(true); setLoading(false);
    loadCoupons();
  }

  async function loadEvents() {
    const res = await fetch("/api/admin/events", { headers });
    const json = await res.json(); setEvents(json.data ?? []);
  }
  async function loadCoupons() {
    const res = await fetch("/api/admin/coupons", { headers });
    const json = await res.json(); setCoupons(json.data ?? []);
  }

  useEffect(() => { if (authed && tab === "coupons") loadCoupons(); }, [tab]);

  async function createEvent(e: React.SyntheticEvent) {
    e.preventDefault(); setLoading(true); setMsg("");
    const res = await fetch("/api/admin/events", { method: "POST", headers, body: JSON.stringify(ef) });
    const json = await res.json();
    if (!res.ok) { setMsg("❌ " + json.error); } else { setMsg("✅ Event created!"); setEf({ name: "", description: "", price: "", date: "", time: "", location: "" }); await loadEvents(); }
    setLoading(false);
  }

  async function toggleLive(event: RunEvent) {
    const res = await fetch("/api/admin/events", { method: "PATCH", headers, body: JSON.stringify({ id: event.id, is_live: !event.is_live }) });
    if (res.ok) loadEvents();
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    await fetch("/api/admin/events", { method: "DELETE", headers, body: JSON.stringify({ id }) });
    loadEvents();
  }

  async function createCoupon(e: React.SyntheticEvent) {
    e.preventDefault(); setLoading(true); setMsg("");
    const payload: Record<string, unknown> = {
      type: cf.type,
      description: cf.description,
      discount_type: cf.discount_type,
      discount_value: Number(cf.discount_value),
      max_uses: Number(cf.max_uses) || 999,
      event_id: cf.event_id || null,
      expires_at: cf.expires_at || null,
    };
    if (cf.type === "shared") { payload.code = cf.code; }
    else {
      payload.prefix = cf.prefix;
      payload.emails = cf.emails.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    }
    const res = await fetch("/api/admin/coupons", { method: "POST", headers, body: JSON.stringify(payload) });
    const json = await res.json();
    if (!res.ok) { setMsg("❌ " + json.error); }
    else {
      const count = Array.isArray(json.data) ? json.data.length : 1;
      setMsg(`✅ ${count} coupon${count > 1 ? "s" : ""} created!`);
      setCf({ type: "shared", code: "", prefix: "CS", emails: "", description: "", discount_type: "percentage", discount_value: "", max_uses: "999", event_id: "", expires_at: "" });
      loadCoupons();
    }
    setLoading(false);
  }

  async function deleteCoupon(id: string) {
    if (!confirm("Delete this coupon?")) return;
    await fetch("/api/admin/coupons", { method: "DELETE", headers, body: JSON.stringify({ id }) });
    loadCoupons();
  }

  function fmtDate(d: string) {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", marginBottom: "2.5rem", justifyContent: "center" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>Admin · Events</span>
        </Link>
        <div style={S.card}>
          <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem", fontWeight: 600 }}>Admin Access</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "#fff", marginBottom: "1.75rem" }}>Events & Coupons</h1>
          <form onSubmit={login}>
            <label style={S.label}>Password</label>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthErr(""); }} placeholder="Admin password" autoFocus style={{ ...S.input, marginBottom: "1rem" }} />
            {authErr && <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "9px 12px", marginBottom: "1rem", fontSize: "0.8rem", color: "#f09595" }}>{authErr}</div>}
            <button type="submit" disabled={loading} style={{ ...S.btn, width: "100%" }}>{loading ? "Checking…" : "Access Dashboard"}</button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Admin</span>
        <span style={{ color: "#444" }}>/</span>
        <span style={{ fontSize: "0.85rem", color: "#888" }}>Events & Coupons</span>
      </header>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "2rem", background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "4px", width: "fit-content" }}>
          {(["events", "coupons"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "8px 22px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, background: tab === t ? "#e8620a" : "transparent", color: tab === t ? "#fff" : "#888", transition: "all 0.2s" }}>
              {t === "events" ? "🗓 Events" : "🎟 Coupons"}
            </button>
          ))}
        </div>

        {msg && <div style={{ padding: "10px 14px", borderRadius: "6px", marginBottom: "1.5rem", fontSize: "0.85rem", background: msg.startsWith("✅") ? "rgba(74,222,128,0.08)" : "rgba(226,75,74,0.08)", border: `1px solid ${msg.startsWith("✅") ? "rgba(74,222,128,0.25)" : "rgba(226,75,74,0.3)"}`, color: msg.startsWith("✅") ? "#4ade80" : "#f09595" }}>{msg}</div>}

        {/* ── EVENTS TAB ── */}
        {tab === "events" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

            {/* Create form */}
            <div style={S.card}>
              <div style={{ fontSize: "11px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "1.25rem" }}>Create New Event</div>
              <form onSubmit={createEvent}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={S.label}>Event Name *</label>
                    <input style={S.input} value={ef.name} onChange={(e) => setEf((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekend Special Run" required />
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={S.label}>Description</label>
                    <textarea style={{ ...S.input, minHeight: "80px", resize: "vertical" } as React.CSSProperties} value={ef.description} onChange={(e) => setEf((f) => ({ ...f, description: e.target.value }))} placeholder="Tell runners what to expect…" />
                  </div>
                  <div>
                    <label style={S.label}>Price (₹)</label>
                    <input style={S.input} type="number" value={ef.price} onChange={(e) => setEf((f) => ({ ...f, price: e.target.value }))} placeholder="0 = free" min="0" />
                  </div>
                  <div>
                    <label style={S.label}>Location *</label>
                    <input style={S.input} value={ef.location} onChange={(e) => setEf((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Kondapur, Hyderabad" required />
                  </div>
                  <div>
                    <label style={S.label}>Date</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={ef.date} onChange={(e) => setEf((f) => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.label}>Time</label>
                    <input style={S.input} type="time" value={ef.time} onChange={(e) => setEf((f) => ({ ...f, time: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" disabled={loading} style={S.btn}>{loading ? "Creating…" : "Create Event"}</button>
              </form>
            </div>

            {/* Events list */}
            <div>
              <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>All Events ({events.length})</div>
              {events.length === 0
                ? <div style={{ ...S.card, textAlign: "center", color: "#555" }}>No events yet.</div>
                : events.map((ev) => (
                  <div key={ev.id} style={{ ...S.card, marginBottom: "1rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{ev.name}</span>
                        {ev.is_live
                          ? <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: "rgba(74,222,128,0.12)", color: "#4ade80", fontWeight: 700 }}>LIVE</span>
                          : <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: "rgba(255,255,255,0.06)", color: "#888" }}>DRAFT</span>}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "2px" }}>
                        {ev.date ? fmtDate(ev.date) : "No date"}{ev.time ? ` · ${ev.time}` : ""} · {ev.location}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#e8620a", fontWeight: 600 }}>
                        {ev.price === 0 ? "Free" : `₹${ev.price}`}
                      </div>
                      {ev.description && <div style={{ fontSize: "0.78rem", color: "#666", marginTop: "4px" }}>{ev.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                      <button onClick={() => toggleLive(ev)}
                        style={{ padding: "7px 16px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700, background: ev.is_live ? "rgba(74,222,128,0.12)" : "rgba(232,98,10,0.12)", color: ev.is_live ? "#4ade80" : "#e8620a" }}>
                        {ev.is_live ? "Take Offline" : "Make Live"}
                      </button>
                      <button onClick={() => deleteEvent(ev.id)}
                        style={{ padding: "7px 14px", borderRadius: "6px", border: "1px solid rgba(226,75,74,0.3)", cursor: "pointer", fontSize: "0.8rem", background: "transparent", color: "#f09595" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── COUPONS TAB ── */}
        {tab === "coupons" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

            {/* Create form */}
            <div style={S.card}>
              <div style={{ fontSize: "11px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "1.25rem" }}>Create Coupon</div>
              <form onSubmit={createCoupon}>

                {/* Type toggle */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "1.25rem", background: "rgba(255,255,255,0.04)", borderRadius: "6px", padding: "3px", width: "fit-content" }}>
                  {[{ v: "shared", l: "Shared Code" }, { v: "unique", l: "Unique Per Member" }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setCf((f) => ({ ...f, type: v }))}
                      style={{ padding: "6px 18px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, background: cf.type === v ? "#e8620a" : "transparent", color: cf.type === v ? "#fff" : "#888" }}>
                      {l}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  {cf.type === "shared" ? (
                    <div>
                      <label style={S.label}>Coupon Code *</label>
                      <input style={S.input} value={cf.code} onChange={(e) => setCf((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SUMMER20" required />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label style={S.label}>Code Prefix</label>
                        <input style={S.input} value={cf.prefix} onChange={(e) => setCf((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))} placeholder="CS" maxLength={6} />
                      </div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={S.label}>Member Emails (one per line or comma-separated) *</label>
                        <textarea style={{ ...S.input, minHeight: "100px", resize: "vertical" } as React.CSSProperties} value={cf.emails} onChange={(e) => setCf((f) => ({ ...f, emails: e.target.value }))} placeholder={"member1@email.com\nmember2@email.com"} required={cf.type === "unique"} />
                        <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>One unique code will be generated per email.</div>
                      </div>
                    </>
                  )}
                  <div>
                    <label style={S.label}>Description</label>
                    <input style={S.input} value={cf.description} onChange={(e) => setCf((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Member exclusive 20% off" />
                  </div>
                  <div>
                    <label style={S.label}>Discount Type</label>
                    <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={cf.discount_type} onChange={(e) => setCf((f) => ({ ...f, discount_type: e.target.value }))}>
                      <option value="percentage" style={{ background: "#1a1a1a" }}>Percentage (%)</option>
                      <option value="fixed" style={{ background: "#1a1a1a" }}>Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Discount Value *</label>
                    <input style={S.input} type="number" value={cf.discount_value} onChange={(e) => setCf((f) => ({ ...f, discount_value: e.target.value }))} placeholder={cf.discount_type === "percentage" ? "20 = 20% off" : "50 = ₹50 off"} required min="1" />
                  </div>
                  {cf.type === "shared" && (
                    <div>
                      <label style={S.label}>Max Uses</label>
                      <input style={S.input} type="number" value={cf.max_uses} onChange={(e) => setCf((f) => ({ ...f, max_uses: e.target.value }))} placeholder="999" min="1" />
                    </div>
                  )}
                  <div>
                    <label style={S.label}>Restrict to Event (optional)</label>
                    <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={cf.event_id} onChange={(e) => setCf((f) => ({ ...f, event_id: e.target.value }))}>
                      <option value="" style={{ background: "#1a1a1a" }}>All events</option>
                      {events.map((ev) => <option key={ev.id} value={ev.id} style={{ background: "#1a1a1a" }}>{ev.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Expiry Date (optional)</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={cf.expires_at} onChange={(e) => setCf((f) => ({ ...f, expires_at: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" disabled={loading} style={S.btn}>{loading ? "Creating…" : "Create Coupon"}</button>
              </form>
            </div>

            {/* Coupons list */}
            <div>
              <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>All Coupons ({coupons.length})</div>
              {coupons.length === 0
                ? <div style={{ ...S.card, textAlign: "center", color: "#555" }}>No coupons yet.</div>
                : coupons.map((c) => (
                  <div key={c.id} style={{ ...S.card, marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "1rem", fontWeight: 700, color: "#e8620a", letterSpacing: "0.08em" }}>{c.code}</span>
                        <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: "rgba(255,255,255,0.06)", color: "#888" }}>
                          {c.discount_type === "percentage" ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                        </span>
                        {c.assigned_to_email && <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: "rgba(56,189,248,0.1)", color: "#38bdf8" }}>Member</span>}
                      </div>
                      {c.description && <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "2px" }}>{c.description}</div>}
                      {c.assigned_to_email && <div style={{ fontSize: "0.75rem", color: "#555" }}>→ {c.assigned_to_email}</div>}
                      <div style={{ fontSize: "0.75rem", color: "#555", marginTop: "2px" }}>
                        Used {c.use_count}/{c.max_uses === 999 ? "∞" : c.max_uses}
                        {c.expires_at ? ` · Expires ${fmtDate(c.expires_at.split("T")[0])}` : ""}
                      </div>
                    </div>
                    <button onClick={() => deleteCoupon(c.id)}
                      style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(226,75,74,0.3)", cursor: "pointer", fontSize: "0.8rem", background: "transparent", color: "#f09595", flexShrink: 0 }}>
                      Delete
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
