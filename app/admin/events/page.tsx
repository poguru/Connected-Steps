"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getEventLifecycleStatus, LIFECYCLE_LABEL, LIFECYCLE_COLOR, type EventLifecycleStatus } from "@/lib/event-status";
import { getDistanceOption } from "@/lib/event-distances";
import { Card, Button, Input, Label, Alert, Badge, Tabs, EmptyState } from "@/components/ui/ds";

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
};

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
        <Card>
          <Badge color="orange" style={{ marginBottom: "0.5rem" }}>Admin Access</Badge>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "#fff", marginBottom: "1.75rem" }}>Events &amp; Coupons</h1>
          <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthErr(""); }} placeholder="Admin password" autoFocus />
            {authErr && <Alert variant="error">{authErr}</Alert>}
            <Button type="submit" loading={loading} fullWidth>Access Dashboard</Button>
          </form>
        </Card>
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
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
          </Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Admin</span>
          <span style={{ color: "#444" }}>/</span>
          <span style={{ fontSize: "0.85rem", color: "#888" }}>Events &amp; Coupons</span>
        </div>
        <Link href="/admin/events/new"><Button size="sm">+ Create Event</Button></Link>
      </header>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Tabs */}
        <Tabs variant="pill" style={{ marginBottom: "2rem" }}
          tabs={[
            { key: "events",  label: "🗓 Events"  },
            { key: "coupons", label: "🎟 Coupons" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as "events" | "coupons")} />

        {msg && <Alert variant={msg.startsWith("✅") ? "success" : "error"} style={{ marginBottom: "1.5rem" }}>{msg}</Alert>}

        {/* ── EVENTS TAB ── */}
        {tab === "events" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

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
                <EmptyState title="No events in this category." />
              ) : filteredEvents.map(ev => {
                const ls    = getEventLifecycleStatus(ev);
                const lsCol = LIFECYCLE_COLOR[ls];
                const closeAt = fmtDatetime(ev.registration_closes_at);
                return (
                  <Card key={ev.id} style={{ marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" as const }}>
                      {ev.cover_image && (
                        <img src={ev.cover_image} alt="" style={{ width: "72px", height: "56px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: "200px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" as const }}>
                          <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ev.title}</span>
                          <Badge color={ev.status === "published" ? "green" : "gray"} size="sm">
                            {ev.status === "published" ? "LIVE" : "DRAFT"}
                          </Badge>
                          <Badge size="sm" style={{ background: lsCol.bg, border: `1px solid ${lsCol.border}`, color: lsCol.text }}>{LIFECYCLE_LABEL[ls]}</Badge>
                          <Badge color="gray" size="sm">{TYPE_ICON[ev.event_type] ?? ""} {ev.event_type}</Badge>
                          {(ev.distance_categories ?? []).map(cat => {
                            const d = getDistanceOption(cat);
                            return <Badge key={cat} size="sm" style={{ background: d.bg, border: `1px solid ${d.border}`, color: d.color }}>{cat}</Badge>;
                          })}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "2px" }}>
                          📅 {fmtDate(ev.start_date)}{ev.start_time ? ` · ${fmtTime(ev.start_time)}` : ""}
                          {ev.end_date ? ` → ${fmtDate(ev.end_date)}${ev.end_time ? ` ${fmtTime(ev.end_time)}` : ""}` : ""}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "2px" }}>📍 {ev.location}</div>
                        {closeAt && <div style={{ fontSize: "0.72rem", color: "#e8620a", marginBottom: "2px" }}>🔒 Reg. closes: {closeAt} IST</div>}
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
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
                          <Link href={`/admin/events/${ev.id}/manage`}>
                            <Button size="sm" variant="outline">Event Hub</Button>
                          </Link>
                          <Link href={`/admin/events/${ev.id}/edit`}>
                            <Button size="sm" variant="secondary">✏️ Edit</Button>
                          </Link>
                          <Button size="sm" variant={ev.status === "published" ? "secondary" : "ghost"}
                            onClick={() => togglePublish(ev)}>
                            {ev.status === "published" ? "Unpublish" : "Publish"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            const t = prompt("New title:", `${ev.title} (Copy)`);
                            if (!t) return;
                            const res = await fetch(`/api/admin/events/${ev.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_title: t }) });
                            const d = await res.json() as { event_id?: string };
                            if (d.event_id) { window.location.href = `/admin/events/${d.event_id}/manage`; }
                          }}>Duplicate</Button>
                          <Button size="sm" variant="danger" onClick={() => deleteEvent(ev.id)}>Delete</Button>
                        </div>
                        <Link href={`/admin/events/${ev.id}/registrations`}
                          style={{ fontSize: "0.72rem", color: "#555", textDecoration: "none", textAlign: "right", fontWeight: 600 }}>
                          View registrations →
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── COUPONS TAB ── */}
        {tab === "coupons" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

            <Card>
              <Badge color="orange" style={{ marginBottom: "1.25rem" }}>Create Coupon</Badge>
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
                      <Label>Coupon Code *</Label>
                      <input style={S.input} value={cf.code} onChange={e => setCf(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SUMMER20" required />
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label>Code Prefix</Label>
                        <input style={S.input} value={cf.prefix} onChange={e => setCf(f => ({ ...f, prefix: e.target.value.toUpperCase() }))} placeholder="CS" maxLength={6} />
                      </div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <Label>Member Emails (one per line or comma-separated) *</Label>
                        <textarea style={{ ...S.input, minHeight: "100px", resize: "vertical" } as React.CSSProperties} value={cf.emails} onChange={e => setCf(f => ({ ...f, emails: e.target.value }))} placeholder={"member1@email.com\nmember2@email.com"} required={cf.type === "unique"} />
                        <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>One unique code will be generated per email.</div>
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Description</Label>
                    <input style={S.input} value={cf.description} onChange={e => setCf(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Member exclusive 20% off" />
                  </div>
                  <div>
                    <Label>Discount Type</Label>
                    <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={cf.discount_type} onChange={e => setCf(f => ({ ...f, discount_type: e.target.value }))}>
                      <option value="percentage" style={{ background: "#1a1a1a" }}>Percentage (%)</option>
                      <option value="fixed" style={{ background: "#1a1a1a" }}>Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <Label>Discount Value *</Label>
                    <input style={S.input} type="number" value={cf.discount_value} onChange={e => setCf(f => ({ ...f, discount_value: e.target.value }))} placeholder={cf.discount_type === "percentage" ? "20 = 20% off" : "50 = ₹50 off"} required min="1" />
                  </div>
                  {cf.type === "shared" && (
                    <div>
                      <Label>Max Uses</Label>
                      <input style={S.input} type="number" value={cf.max_uses} onChange={e => setCf(f => ({ ...f, max_uses: e.target.value }))} placeholder="999" min="1" />
                    </div>
                  )}
                  <div>
                    <Label>Restrict to Event (optional)</Label>
                    <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={cf.event_id} onChange={e => setCf(f => ({ ...f, event_id: e.target.value }))}>
                      <option value="" style={{ background: "#1a1a1a" }}>All events</option>
                      {events.map(ev => <option key={ev.id} value={ev.id} style={{ background: "#1a1a1a" }}>{ev.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Expiry Date (optional)</Label>
                    <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={cf.expires_at} onChange={e => setCf(f => ({ ...f, expires_at: e.target.value }))} />
                  </div>
                </div>
                <Button type="submit" loading={loading}>Create Coupon</Button>
              </form>
            </Card>

            <div>
              <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>All Coupons ({coupons.length})</div>
              {coupons.length === 0 ? (
                <EmptyState title="No coupons yet." />
              ) : coupons.map(c => (
                <Card key={c.id} style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" as const }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "1rem", fontWeight: 700, color: "#e8620a", letterSpacing: "0.08em" }}>{c.code}</span>
                      <Badge color="gray" size="sm">
                        {c.discount_type === "percentage" ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                      </Badge>
                      {c.assigned_to_email && <Badge color="blue" size="sm">Member</Badge>}
                    </div>
                    {c.description && <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "2px" }}>{c.description}</div>}
                    {c.assigned_to_email && <div style={{ fontSize: "0.75rem", color: "#555" }}>→ {c.assigned_to_email}</div>}
                    <div style={{ fontSize: "0.75rem", color: "#555", marginTop: "2px" }}>
                      Used {c.use_count}/{c.max_uses === 999 ? "∞" : c.max_uses}
                      {c.expires_at ? ` · Expires ${fmtDate(c.expires_at.split("T")[0])}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => deleteCoupon(c.id)}>Delete</Button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
