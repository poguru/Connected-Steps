"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getEventLifecycleStatus, LIFECYCLE_LABEL, LIFECYCLE_COLOR, type EventLifecycleStatus } from "@/lib/event-status";
import { DISTANCE_OPTIONS, getDistanceOption } from "@/lib/event-distances";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Event {
  id:                      string;
  title:                   string;
  description:             string | null;
  event_type:              string;
  cover_image:             string | null;
  start_date:              string;
  start_time:              string | null;
  end_date:                string | null;
  end_time:                string | null;
  registration_closes_at:  string | null;
  distance_categories:     string[];
  location:                string;
  organizer:               string | null;
  max_participants:         number | null;
  registration_required:   boolean;
  price:                   number;
  featured:                boolean;
  terms_conditions:        string | null;
  maps_url:                string | null;
  status:                  string;
  share_slug:              string | null;
  view_count:              number;
  share_count:             number;
  created_at:              string;
}

interface Coupon {
  id:                string;
  code:              string;
  description:       string;
  discount_type:     string;
  discount_value:    number;
  assigned_to_email: string | null;
  max_uses:          number;
  use_count:         number;
  expires_at:        string | null;
  created_at:        string;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  input: { width: "100%", padding: "10px 13px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" },
  label: { display: "block", fontSize: "11px", color: "#888", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: "5px" },
  btn:   { padding: "10px 22px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" },
  card:  { background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "1.5rem" },
};

const EVENT_TYPES = ["running", "cycling", "training", "race", "community", "workshop"];
const TYPE_ICON: Record<string, string> = { running: "🏃", cycling: "🚴", training: "💪", race: "🏆", community: "🤝", workshop: "📚" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function fmtDatetime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Convert a local IST date + time string into an ISO TIMESTAMPTZ string (UTC)
function toIST_ISO(date: string, time: string): string {
  return `${date}T${time}:00+05:30`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const [password, setPassword] = useState("");
  const [authed,   setAuthed]   = useState(true);
  const [authErr,  setAuthErr]  = useState("");
  const [tab,      setTab]      = useState<"events" | "coupons">("events");

  const [events,       setEvents]       = useState<Event[]>([]);
  const [coupons,      setCoupons]      = useState<Coupon[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [msg,          setMsg]          = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EventLifecycleStatus>("all");

  // Event form
  const blankEf = {
    title: "", description: "", event_type: "running", cover_image: "",
    start_date: "", start_time: "", end_date: "", end_time: "",
    registration_close_date: "", registration_close_time: "",
    location: "", organizer: "", max_participants: "",
    registration_required: true, price: "0", featured: false,
    terms_conditions: "", maps_url: "",
    distance_categories: [] as string[],
  };
  const [ef, setEf] = useState(blankEf);

  // Coupon form
  const [cf, setCf] = useState({ type: "shared", code: "", prefix: "CS", emails: "", description: "", discount_type: "percentage", discount_value: "", max_uses: "999", event_id: "", expires_at: "" });

  const headers = { "Content-Type": "application/json" };

  async function login(e: React.SyntheticEvent) {
    e.preventDefault(); setLoading(true); setAuthErr("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setAuthErr("Incorrect password."); return; }
      setAuthed(true);
    } catch { setAuthErr("Network error."); }
    finally { setLoading(false); }
  }

  async function loadEvents() {
    const res = await fetch("/api/admin/events", { headers });
    const json = await res.json(); setEvents(json.data ?? []);
  }
  async function loadCoupons() {
    const res = await fetch("/api/admin/coupons", { headers });
    const json = await res.json(); setCoupons(json.data ?? []);
  }

  useEffect(() => { if (authed && tab === "coupons") loadCoupons(); }, [tab]); // eslint-disable-line
  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { if (authed) loadEvents(); }, [authed]); // eslint-disable-line

  async function createEvent(e: React.SyntheticEvent) {
    e.preventDefault(); setLoading(true); setMsg("");

    // Build registration_closes_at from the two separate date+time inputs
    let registration_closes_at: string | null = null;
    if (ef.registration_close_date && ef.registration_close_time) {
      registration_closes_at = toIST_ISO(ef.registration_close_date, ef.registration_close_time);
    } else if (ef.registration_close_date) {
      registration_closes_at = toIST_ISO(ef.registration_close_date, "23:59");
    }

    const body = {
      title:                  ef.title,
      description:            ef.description || null,
      event_type:             ef.event_type,
      cover_image:            ef.cover_image || null,
      start_date:             ef.start_date,
      start_time:             ef.start_time || null,
      end_date:               ef.end_date || null,
      end_time:               ef.end_time || null,
      registration_closes_at,
      location:               ef.location,
      organizer:              ef.organizer || null,
      max_participants:       ef.max_participants ? Number(ef.max_participants) : null,
      registration_required:  ef.registration_required,
      price:                  Number(ef.price) || 0,
      featured:               ef.featured,
      terms_conditions:       ef.terms_conditions || null,
      maps_url:               ef.maps_url || null,
      distance_categories:    ef.distance_categories,
    };
    const res  = await fetch("/api/admin/events", { method: "POST", headers, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) { setMsg("❌ " + json.error); } else { setMsg("✅ Event created as draft!"); setEf(blankEf); await loadEvents(); }
    setLoading(false);
  }

  async function togglePublish(ev: Event) {
    const newStatus = ev.status === "published" ? "draft" : "published";
    const res = await fetch("/api/admin/events", { method: "PATCH", headers, body: JSON.stringify({ id: ev.id, status: newStatus }) });
    if (res.ok) loadEvents();
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event? All registrations will also be deleted.")) return;
    setMsg("");
    const res = await fetch("/api/admin/events", { method: "DELETE", headers, body: JSON.stringify({ id }) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg("❌ Delete failed: " + (json.error ?? "Unknown error"));
    } else {
      setMsg("✅ Event deleted.");
      loadEvents();
    }
  }

  async function createCoupon(e: React.SyntheticEvent) {
    e.preventDefault(); setLoading(true); setMsg("");
    const payload: Record<string, unknown> = {
      type: cf.type, description: cf.description,
      discount_type: cf.discount_type, discount_value: Number(cf.discount_value),
      max_uses: Number(cf.max_uses) || 999,
      event_id: cf.event_id || null, expires_at: cf.expires_at || null,
    };
    if (cf.type === "shared") { payload.code = cf.code; }
    else { payload.prefix = cf.prefix; payload.emails = cf.emails.split(/[\n,]+/).map(s => s.trim()).filter(Boolean); }
    const res  = await fetch("/api/admin/coupons", { method: "POST", headers, body: JSON.stringify(payload) });
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

  // ── Login screen ─────────────────────────────────────────────────────────────

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", marginBottom: "2.5rem", justifyContent: "center" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>Admin · Events</span>
        </Link>
        <div style={S.card}>
          <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem", fontWeight: 600 }}>Admin Access</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "#fff", marginBottom: "1.75rem" }}>Events &amp; Coupons</h1>
          <form onSubmit={login}>
            <label style={S.label}>Password</label>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthErr(""); }} placeholder="Admin password" autoFocus style={{ ...S.input, marginBottom: "1rem" }} />
            {authErr && <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "9px 12px", marginBottom: "1rem", fontSize: "0.8rem", color: "#f09595" }}>{authErr}</div>}
            <button type="submit" disabled={loading} style={{ ...S.btn, width: "100%" }}>{loading ? "Checking…" : "Access Dashboard"}</button>
          </form>
        </div>
      </div>
    </div>
  );

  // ── Filter events by lifecycle status ────────────────────────────────────────

  const filteredEvents = events.filter(ev => {
    if (statusFilter === "all") return true;
    return getEventLifecycleStatus(ev) === statusFilter;
  });

  const statusCounts = {
    all:                  events.length,
    UPCOMING:             events.filter(ev => getEventLifecycleStatus(ev) === "UPCOMING").length,
    REGISTRATION_CLOSED:  events.filter(ev => getEventLifecycleStatus(ev) === "REGISTRATION_CLOSED").length,
    ONGOING:              events.filter(ev => getEventLifecycleStatus(ev) === "ONGOING").length,
    COMPLETED:            events.filter(ev => getEventLifecycleStatus(ev) === "COMPLETED").length,
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Admin</span>
        <span style={{ color: "#444" }}>/</span>
        <span style={{ fontSize: "0.85rem", color: "#888" }}>Events &amp; Coupons</span>
      </header>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "2rem", background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "4px", width: "fit-content" }}>
          {(["events", "coupons"] as const).map(t => (
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
                    <label style={S.label}>Event Title *</label>
                    <input style={S.input} value={ef.title} onChange={e => setEf(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Weekend Group Run – Jubilee Hills" required />
                  </div>

                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={S.label}>Description</label>
                    <textarea style={{ ...S.input, minHeight: "80px", resize: "vertical" } as React.CSSProperties} value={ef.description} onChange={e => setEf(f => ({ ...f, description: e.target.value }))} placeholder="Tell participants what to expect…" />
                  </div>

                  <div>
                    <label style={S.label}>Event Type *</label>
                    <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={ef.event_type} onChange={e => setEf(f => ({ ...f, event_type: e.target.value }))}>
                      {EVENT_TYPES.map(t => <option key={t} value={t} style={{ background: "#1a1a1a" }}>{TYPE_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={S.label}>Location *</label>
                    <input style={S.input} value={ef.location} onChange={e => setEf(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Kondapur, Hyderabad" required />
                  </div>

                  {/* ── Event Start ── */}
                  <div>
                    <label style={S.label}>Event Start Date *</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={ef.start_date} onChange={e => setEf(f => ({ ...f, start_date: e.target.value }))} required />
                  </div>

                  <div>
                    <label style={S.label}>Event Start Time (IST)</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="time" value={ef.start_time} onChange={e => setEf(f => ({ ...f, start_time: e.target.value }))} />
                  </div>

                  {/* ── Event End ── */}
                  <div>
                    <label style={S.label}>Event End Date</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={ef.end_date} onChange={e => setEf(f => ({ ...f, end_date: e.target.value }))} />
                  </div>

                  <div>
                    <label style={S.label}>Event End Time (IST)</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="time" value={ef.end_time} onChange={e => setEf(f => ({ ...f, end_time: e.target.value }))} />
                  </div>

                  {/* ── Registration Close — two fields ── */}
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={{ fontSize: "11px", color: "#e8620a", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem", paddingTop: "0.25rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      Registration Deadline
                    </div>
                  </div>

                  <div>
                    <label style={S.label}>Registration Closes — Date</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={ef.registration_close_date} onChange={e => setEf(f => ({ ...f, registration_close_date: e.target.value }))} />
                  </div>

                  <div>
                    <label style={S.label}>Registration Closes — Time (IST)</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="time" value={ef.registration_close_time} onChange={e => setEf(f => ({ ...f, registration_close_time: e.target.value }))} />
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>
                      {ef.registration_close_date && ef.registration_close_time
                        ? `Closes: ${ef.registration_close_date} at ${fmtTime(ef.registration_close_time)} IST`
                        : "Leave blank for no deadline"}
                    </div>
                  </div>

                  {/* ── Distance Categories ── */}
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={{ fontSize: "11px", color: "#e8620a", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem", paddingTop: "0.25rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      Distance Categories
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {DISTANCE_OPTIONS.map(opt => {
                        const selected = ef.distance_categories.includes(opt.code);
                        return (
                          <button key={opt.code} type="button"
                            onClick={() => setEf(f => ({
                              ...f,
                              distance_categories: selected
                                ? f.distance_categories.filter(c => c !== opt.code)
                                : [...f.distance_categories, opt.code],
                            }))}
                            style={{
                              padding: "5px 14px", borderRadius: "20px", border: "1px solid",
                              cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, fontFamily: "inherit",
                              transition: "all 0.15s",
                              background: selected ? opt.bg : "transparent",
                              borderColor: selected ? opt.border : "rgba(255,255,255,0.12)",
                              color: selected ? opt.color : "#666",
                            }}>
                            {selected ? "✓ " : ""}{opt.code}
                          </button>
                        );
                      })}
                    </div>
                    {ef.distance_categories.length > 0 && (
                      <div style={{ fontSize: "11px", color: "#555", marginTop: "8px" }}>
                        Selected: {ef.distance_categories.join(", ")}
                        {ef.distance_categories.length > 1 ? " — users will pick one during registration" : ""}
                      </div>
                    )}
                  </div>

                  {/* ── Rest of fields ── */}
                  <div>
                    <label style={S.label}>Organizer</label>
                    <input style={S.input} value={ef.organizer} onChange={e => setEf(f => ({ ...f, organizer: e.target.value }))} placeholder="e.g. Kalyan" />
                  </div>

                  <div>
                    <label style={S.label}>Max Participants</label>
                    <input style={S.input} type="number" min="1" value={ef.max_participants} onChange={e => setEf(f => ({ ...f, max_participants: e.target.value }))} placeholder="Leave blank for unlimited" />
                  </div>

                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={S.label}>Cover Image URL</label>
                    <input style={S.input} value={ef.cover_image} onChange={e => setEf(f => ({ ...f, cover_image: e.target.value }))} placeholder="https://… (optional)" />
                    {ef.cover_image && (
                      <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", height: "100px" }}>
                        <img src={ef.cover_image} alt="cover preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => (e.currentTarget.style.display = "none")} />
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={S.label}>Registration Price (₹)</label>
                    <input style={S.input} type="number" min="0" value={ef.price} onChange={e => setEf(f => ({ ...f, price: e.target.value }))} placeholder="0 for free events" />
                    {Number(ef.price) === 0 && <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>Free event — no payment required</div>}
                  </div>

                  <div>
                    <label style={S.label}>Google Maps URL</label>
                    <input style={S.input} value={ef.maps_url} onChange={e => setEf(f => ({ ...f, maps_url: e.target.value }))} placeholder="https://maps.google.com/…" />
                  </div>

                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={S.label}>Terms &amp; Conditions</label>
                    <textarea style={{ ...S.input, minHeight: "80px", resize: "vertical" } as React.CSSProperties} value={ef.terms_conditions} onChange={e => setEf(f => ({ ...f, terms_conditions: e.target.value }))} placeholder="e.g. Participants must carry their own water. No refunds after 48 hours..." />
                  </div>

                  <div>
                    <label style={{ ...S.label, marginBottom: 0 }}>Featured Event</label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                      <button type="button" onClick={() => setEf(f => ({ ...f, featured: !f.featured }))}
                        style={{ width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer", background: ef.featured ? "#e8620a" : "rgba(255,255,255,0.15)", transition: "background 0.2s", position: "relative" }}>
                        <span style={{ position: "absolute", top: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", left: ef.featured ? "21px" : "3px" }} />
                      </button>
                      <span style={{ fontSize: "0.8rem", color: "#888" }}>{ef.featured ? "Yes — shown prominently" : "No"}</span>
                    </div>
                  </div>

                  <div>
                    <label style={{ ...S.label, marginBottom: 0 }}>Registration Required</label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                      <button type="button" onClick={() => setEf(f => ({ ...f, registration_required: !f.registration_required }))}
                        style={{ width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer", background: ef.registration_required ? "#e8620a" : "rgba(255,255,255,0.15)", transition: "background 0.2s", position: "relative" }}>
                        <span style={{ position: "absolute", top: "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", left: ef.registration_required ? "21px" : "3px" }} />
                      </button>
                      <span style={{ fontSize: "0.8rem", color: "#888" }}>{ef.registration_required ? "Yes" : "No"}</span>
                    </div>
                  </div>

                </div>
                <button type="submit" disabled={loading} style={S.btn}>{loading ? "Creating…" : "Create Event (Draft)"}</button>
              </form>
            </div>

            {/* Status filter */}
            <div>
              <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                Filter by Status
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.25rem" }}>
                {([
                  { key: "all",                 label: `All (${statusCounts.all})` },
                  { key: "UPCOMING",            label: `Upcoming (${statusCounts.UPCOMING})` },
                  { key: "REGISTRATION_CLOSED", label: `Reg. Closed (${statusCounts.REGISTRATION_CLOSED})` },
                  { key: "ONGOING",             label: `Ongoing (${statusCounts.ONGOING})` },
                  { key: "COMPLETED",           label: `Completed (${statusCounts.COMPLETED})` },
                ] as { key: string; label: string }[]).map(({ key, label }) => (
                  <button key={key} onClick={() => setStatusFilter(key as typeof statusFilter)}
                    style={{ padding: "6px 14px", borderRadius: "20px", border: "1px solid", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
                      background: statusFilter === key ? "#e8620a" : "transparent",
                      borderColor: statusFilter === key ? "#e8620a" : "rgba(255,255,255,0.12)",
                      color: statusFilter === key ? "#fff" : "#888" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Events list */}
              <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>
                {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
              </div>
              {filteredEvents.length === 0 ? (
                <div style={{ ...S.card, textAlign: "center", color: "#555" }}>No events in this category.</div>
              ) : filteredEvents.map(ev => {
                const ls    = getEventLifecycleStatus(ev);
                const lsCol = LIFECYCLE_COLOR[ls];
                const closeAt = fmtDatetime(ev.registration_closes_at);
                return (
                  <div key={ev.id} style={{ ...S.card, marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                      {ev.cover_image && (
                        <img src={ev.cover_image} alt="" style={{ width: "72px", height: "56px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: "200px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ev.title}</span>
                          {/* Publish status */}
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: ev.status === "published" ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.06)", color: ev.status === "published" ? "#4ade80" : "#888", fontWeight: 700 }}>
                            {ev.status === "published" ? "LIVE" : "DRAFT"}
                          </span>
                          {/* Lifecycle status */}
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: lsCol.bg, border: `1px solid ${lsCol.border}`, color: lsCol.text, fontWeight: 700 }}>
                            {LIFECYCLE_LABEL[ls]}
                          </span>
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", color: "#aaa" }}>
                            {TYPE_ICON[ev.event_type] ?? ""} {ev.event_type}
                          </span>
                          {(ev.distance_categories ?? []).map(cat => {
                            const d = getDistanceOption(cat);
                            return (
                              <span key={cat} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", background: d.bg, border: `1px solid ${d.border}`, color: d.color, fontWeight: 700 }}>
                                {cat}
                              </span>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "2px" }}>
                          📅 {fmtDate(ev.start_date)}{ev.start_time ? ` · ${fmtTime(ev.start_time)}` : ""}
                          {ev.end_date ? ` → ${fmtDate(ev.end_date)}${ev.end_time ? ` ${fmtTime(ev.end_time)}` : ""}` : ""}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "2px" }}>📍 {ev.location}</div>
                        {closeAt && (
                          <div style={{ fontSize: "0.72rem", color: "#e8620a", marginBottom: "2px" }}>
                            🔒 Reg. closes: {closeAt} IST
                          </div>
                        )}
                        {ev.organizer && <div style={{ fontSize: "0.75rem", color: "#666" }}>Organizer: {ev.organizer}</div>}
                        {ev.max_participants && <div style={{ fontSize: "0.75rem", color: "#666" }}>Max: {ev.max_participants} participants</div>}
                        <div style={{ fontSize: "0.75rem", color: ev.price ? "#e8620a" : "#555" }}>
                          {ev.price ? `₹${ev.price}` : "Free"}{ev.featured ? " · ★ Featured" : ""}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#444", marginTop: "4px" }}>
                          {ev.view_count} views · {ev.share_count} shares
                          {ev.share_slug ? ` · /events/${ev.share_slug}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0, alignItems: "flex-end" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => togglePublish(ev)}
                            style={{ padding: "7px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, background: ev.status === "published" ? "rgba(74,222,128,0.12)" : "rgba(232,98,10,0.12)", color: ev.status === "published" ? "#4ade80" : "#e8620a" }}>
                            {ev.status === "published" ? "Unpublish" : "Publish"}
                          </button>
                          <button onClick={() => deleteEvent(ev.id)}
                            style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid rgba(226,75,74,0.3)", cursor: "pointer", fontSize: "0.78rem", background: "transparent", color: "#f09595" }}>
                            Delete
                          </button>
                        </div>
                        <Link href={`/admin/events/${ev.id}/registrations`}
                          style={{ fontSize: "0.72rem", color: "#e8620a", textDecoration: "none", textAlign: "right", fontWeight: 600 }}>
                          View registrations →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── COUPONS TAB ── */}
        {tab === "coupons" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

            <div style={S.card}>
              <div style={{ fontSize: "11px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "1.25rem" }}>Create Coupon</div>
              <form onSubmit={createCoupon}>
                <div style={{ display: "flex", gap: "4px", marginBottom: "1.25rem", background: "rgba(255,255,255,0.04)", borderRadius: "6px", padding: "3px", width: "fit-content" }}>
                  {[{ v: "shared", l: "Shared Code" }, { v: "unique", l: "Unique Per Member" }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setCf(f => ({ ...f, type: v }))}
                      style={{ padding: "6px 18px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, background: cf.type === v ? "#e8620a" : "transparent", color: cf.type === v ? "#fff" : "#888" }}>
                      {l}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  {cf.type === "shared" ? (
                    <div>
                      <label style={S.label}>Coupon Code *</label>
                      <input style={S.input} value={cf.code} onChange={e => setCf(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SUMMER20" required />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label style={S.label}>Code Prefix</label>
                        <input style={S.input} value={cf.prefix} onChange={e => setCf(f => ({ ...f, prefix: e.target.value.toUpperCase() }))} placeholder="CS" maxLength={6} />
                      </div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={S.label}>Member Emails (one per line or comma-separated) *</label>
                        <textarea style={{ ...S.input, minHeight: "100px", resize: "vertical" } as React.CSSProperties} value={cf.emails} onChange={e => setCf(f => ({ ...f, emails: e.target.value }))} placeholder={"member1@email.com\nmember2@email.com"} required={cf.type === "unique"} />
                        <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>One unique code will be generated per email.</div>
                      </div>
                    </>
                  )}
                  <div>
                    <label style={S.label}>Description</label>
                    <input style={S.input} value={cf.description} onChange={e => setCf(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Member exclusive 20% off" />
                  </div>
                  <div>
                    <label style={S.label}>Discount Type</label>
                    <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={cf.discount_type} onChange={e => setCf(f => ({ ...f, discount_type: e.target.value }))}>
                      <option value="percentage" style={{ background: "#1a1a1a" }}>Percentage (%)</option>
                      <option value="fixed" style={{ background: "#1a1a1a" }}>Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Discount Value *</label>
                    <input style={S.input} type="number" value={cf.discount_value} onChange={e => setCf(f => ({ ...f, discount_value: e.target.value }))} placeholder={cf.discount_type === "percentage" ? "20 = 20% off" : "50 = ₹50 off"} required min="1" />
                  </div>
                  {cf.type === "shared" && (
                    <div>
                      <label style={S.label}>Max Uses</label>
                      <input style={S.input} type="number" value={cf.max_uses} onChange={e => setCf(f => ({ ...f, max_uses: e.target.value }))} placeholder="999" min="1" />
                    </div>
                  )}
                  <div>
                    <label style={S.label}>Restrict to Event (optional)</label>
                    <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={cf.event_id} onChange={e => setCf(f => ({ ...f, event_id: e.target.value }))}>
                      <option value="" style={{ background: "#1a1a1a" }}>All events</option>
                      {events.map(ev => <option key={ev.id} value={ev.id} style={{ background: "#1a1a1a" }}>{ev.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Expiry Date (optional)</label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={cf.expires_at} onChange={e => setCf(f => ({ ...f, expires_at: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" disabled={loading} style={S.btn}>{loading ? "Creating…" : "Create Coupon"}</button>
              </form>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>All Coupons ({coupons.length})</div>
              {coupons.length === 0 ? (
                <div style={{ ...S.card, textAlign: "center", color: "#555" }}>No coupons yet.</div>
              ) : coupons.map(c => (
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
