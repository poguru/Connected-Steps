"use client";

import { useState, useEffect, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLifecycle } from "@/lib/event-lifecycle";
import { Button, Alert, Badge, Card, EmptyState, Spinner } from "@/components/ui/ds";

// ── Section error boundary ─────────────────────────────────────────────────────

class SectionBoundary extends Component<
  { title: string; children: ReactNode },
  { caught: boolean; msg: string }
> {
  state = { caught: false, msg: "" };
  static getDerivedStateFromError(e: unknown) {
    return { caught: true, msg: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error(`[EventHub] "${this.props.title}" crashed:`, e.message, info.componentStack?.slice(0, 200));
  }
  render() {
    if (this.state.caught) {
      return (
        <div style={{ background: "#111", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>⚠ Unable to load: {this.props.title}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{this.state.msg}</div>
          <Button size="xs" variant="ghost" style={{ marginTop: 8 }} onClick={() => this.setState({ caught: false, msg: "" })}>Retry</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventOverview {
  event: {
    id: string; title: string; status: string;
    start_date: string; start_time: string | null;
    end_date: string | null; end_time: string | null;
    location: string; max_participants: number | null;
    price: number; cover_image: string | null;
    registration_closes_at: string | null;
    distance_categories: string[] | null;
    featured: boolean; share_slug: string | null;
  } | null;
  registrations: { total: number; confirmed: number; pending: number; cancelled: number; paid: number; free: number; checked_in: number; active: number };
  capacity:  { max: number | null; filled: number; remaining: number | null };
  revenue:   { collected: number; pending: number };
  emails:    { campaigns: number; confirmation_sent: number; confirmation_failed: number; campaign_delivered: number; campaign_failed: number; campaign_queued: number };
  races:     Array<{ id: string; name: string; distance: string; price: number; max_slots: number | null; status: string; gun_time: string | null; flag_off_time: string | null; report_time: string | null }>;
  recent_comms: Array<{ sent: number; failed: number; status: string; sent_at: string; subject: string; channel: string | null; recipients: number }>;
}

// ── Nav definition ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "overview",      icon: "⚡", label: "Overview",       inline: true  },
  { key: "registrations", icon: "👥", label: "Registrations",  inline: false, href: "registrations" },
  { key: "participants",  icon: "🪪", label: "Participants",   inline: false, href: "participants"  },
  { key: "races",         icon: "🏁", label: "Races",          inline: true  },
  { key: "communicate",   icon: "📢", label: "Communicate",    inline: false, href: "communicate"   },
  { key: "announce",      icon: "📣", label: "Announce",       inline: true  },
  { key: "race-day",      icon: "🏃", label: "Race Day",       inline: false, href: "race-day"      },
  { key: "bib",           icon: "📦", label: "BIB Collection", inline: false, href: "bib"           },
  { key: "results",       icon: "🏅", label: "Results",        inline: false, href: "results"       },
  { key: "analytics",     icon: "📈", label: "Analytics",      inline: false, href: "analytics"     },
  { key: "sponsors",      icon: "🤝", label: "Sponsors",       inline: false, href: "sponsors"      },
  { key: "volunteers",    icon: "🙋", label: "Volunteers",     inline: false, href: "volunteers"    },
  { key: "services",      icon: "🔧", label: "Services",       inline: false, href: "services"      },
  { key: "cancellations", icon: "↩️", label: "Cancellations",  inline: false, href: "cancellations" },
  { key: "finance",       icon: "💰", label: "Finance",        inline: true  },
  { key: "settings",      icon: "⚙️", label: "Settings",       inline: true  },
] as const;

type TabKey = typeof NAV_ITEMS[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number)    { return (n ?? 0).toLocaleString("en-IN"); }
function fmtInr(n: number) { return `₹${(n ?? 0).toLocaleString("en-IN")}`; }
function fmtDate(d: string) {
  try { return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
function fmtTime(t: string | null) {
  if (!t) return null;
  try { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
  catch { return t; }
}
function safePct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }

// ── Status badge ───────────────────────────────────────────────────────────────

const FALLBACK_BADGE = { label: "Published", color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)" };
const BADGES: Record<string, typeof FALLBACK_BADGE> = {
  draft:                { label: "Draft",         color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  archived:             { label: "Archived",       color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)"  },
  registration_not_open:{ label: "Reg. Not Open", color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)"   },
  registration_open:    { label: "Reg. Open",     color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.3)"   },
  registration_closed:  { label: "Reg. Closed",   color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)"   },
  event_live:           { label: "Live Now",       color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)"  },
  completed:            { label: "Completed",      color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
};

function getBadge(ev: EventOverview["event"]) {
  if (!ev) return FALLBACK_BADGE;
  if (ev.status === "draft" || ev.status === "archived") return BADGES[ev.status] ?? FALLBACK_BADGE;
  try {
    const lc = getLifecycle({ start_date: ev.start_date, start_time: ev.start_time, end_date: ev.end_date, end_time: ev.end_time, registration_closes_at: ev.registration_closes_at });
    return BADGES[lc.state] ?? FALLBACK_BADGE;
  } catch { return FALLBACK_BADGE; }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EventStatCard({ label, value, color = "#fff", accent = false }: { label: string; value: string | number; color?: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? `${color}0d` : "#111", border: `1px solid ${accent ? `${color}22` : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "0.85rem 1rem" }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 5, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function SecHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{title}</div>
      {action}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EventManagePage() {
  const { id: eventId } = useParams() as { id: string };

  const [data,    setData]    = useState<EventOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<TabKey>("overview");

  const load = useCallback(async () => {
    if (!eventId) { setError("No event ID"); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/overview`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const ev = json.event ?? null;
      if (!ev) throw new Error("Event not found");
      setData({
        event: ev,
        registrations: { total: 0, confirmed: 0, pending: 0, cancelled: 0, paid: 0, free: 0, checked_in: 0, active: 0, ...json.registrations },
        capacity:      { max: null, filled: 0, remaining: null, ...json.capacity },
        revenue:       { collected: 0, pending: 0, ...json.revenue },
        emails:        { campaigns: 0, confirmation_sent: 0, confirmation_failed: 0, campaign_delivered: 0, campaign_failed: 0, campaign_queued: 0, ...json.emails },
        races:         json.races         ?? [],
        recent_comms:  json.recent_comms  ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function togglePublish() {
    if (!data?.event) return;
    const next = data.event.status === "published" ? "draft" : "published";
    await fetch("/api/admin/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: eventId, status: next }) });
    setData(d => d?.event ? { ...d, event: { ...d.event, status: next } } : d);
  }

  async function duplicateEvent() {
    const t = prompt("New event title:", `${data?.event?.title ?? ""} (Copy)`);
    if (t === null) return;
    const res = await fetch(`/api/admin/events/${eventId}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_title: t || undefined, include_sponsors: confirm("Copy sponsors too?") }) });
    const d   = await res.json() as { event_id?: string; title?: string; error?: string };
    if (res.ok && d.event_id) { if (confirm(`✅ "${d.title}" created. Open it?`)) window.location.href = `/admin/events/${d.event_id}/manage`; }
    else alert(`❌ ${d.error ?? "Failed"}`);
  }

  async function archiveEvent() {
    if (!data?.event) return;
    const isArch = data.event.status === "archived";
    if (!confirm(`${isArch ? "Restore" : "Archive"} this event?`)) return;
    const res = await fetch(`/api/admin/events/${eventId}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: isArch ? "restore" : "archive" }) });
    const d   = await res.json() as { status?: string; error?: string };
    if (res.ok && d.status) setData(o => o?.event ? { ...o, event: { ...o.event, status: d.status! } } : o);
    else alert(`❌ ${d.error}`);
  }

  // ── Announce tab state ───────────────────────────────────────────────────────

  const [annPreview,   setAnnPreview]   = useState<{ member_count: number; email_count: number; wa_count: number } | null>(null);
  const [annLoading,   setAnnLoading]   = useState(false);
  const [annChannels,  setAnnChannels]  = useState(["email", "whatsapp"]);
  const [annSubject,   setAnnSubject]   = useState("");
  const [annBody,      setAnnBody]      = useState("");
  const [annSending,   setAnnSending]   = useState(false);
  const [annResult,    setAnnResult]    = useState<{ email_queued: number; wa_total: number; batch_id: string } | null>(null);
  const [annError,     setAnnError]     = useState("");
  const [annDelivered, setAnnDelivered] = useState(0);
  const [annPolling,   setAnnPolling]   = useState(false);
  const [annPollTotal, setAnnPollTotal] = useState(0);

  function defaultBody(_evTitle: string, _dateStr: string, timeStr: string, _location: string) {
    return `We're excited to announce an upcoming event!\n\n🏃 {event}\n📅 {date}${timeStr ? " at {time}" : ""}\n📍 {location}\n\nRegister now to secure your spot:\n{register_link}\n\nSee you there!\n\nTeam Connected Steps`;
  }

  async function loadAnnouncePreview() {
    setAnnLoading(true); setAnnError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/announce`);
      const data = await res.json();
      if (!res.ok) { setAnnError(data.error ?? "Failed"); return; }
      setAnnPreview(data);
      if (!annSubject && data.event) {
        const d = data.event.start_date
          ? new Date(data.event.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "";
        const t = data.event.start_time
          ? (() => { const [h, m] = data.event.start_time.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; })()
          : "";
        setAnnSubject(`Upcoming Event: ${data.event.title}${d ? ` — ${d}` : ""}`);
        setAnnBody(defaultBody(data.event.title, d, t, data.event.location));
      }
    } catch { setAnnError("Network error."); }
    finally { setAnnLoading(false); }
  }

  async function sendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!annChannels.length) { setAnnError("Select at least one channel."); return; }
    if (annChannels.includes("email") && (!annSubject.trim() || !annBody.trim())) {
      setAnnError("Subject and body are required."); return;
    }
    if (!confirm(`Send to ${annPreview?.member_count ?? "all"} active members via ${annChannels.join(" + ")}?`)) return;
    setAnnSending(true); setAnnError(""); setAnnResult(null); setAnnDelivered(0);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: annChannels, subject: annSubject, email_body: annBody }),
      });
      const data = await res.json();
      if (!res.ok) { setAnnError(data.error ?? "Send failed."); return; }
      setAnnResult(data);
      if (data.email_queued > 0) {
        setAnnPollTotal(data.email_queued);
        setAnnPolling(true);
      }
    } catch { setAnnError("Network error."); }
    finally { setAnnSending(false); }
  }

  useEffect(() => {
    if (!annPolling || !annResult?.batch_id) return;
    const batchId = annResult.batch_id;
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/admin/events/${eventId}/communicate/status?batch_id=${batchId}`);
        const data = await res.json() as { queued: number; sending: number; delivered: number };
        setAnnDelivered(data.delivered ?? 0);
        if (data.queued === 0 && data.sending === 0) {
          setAnnPolling(false);
        }
      } catch { /* non-critical */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [annPolling, annResult?.batch_id, eventId]);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: "3rem 2rem", textAlign: "center" }}><Spinner /></div>;

  if (error || !data?.event) return (
    <div style={{ padding: "3rem 2rem", textAlign: "center" }}>
      <Alert variant="error" style={{ marginBottom: 12 }}>{error || "Event not found"}</Alert>
      <Link href="/admin/events" style={{ color: "#e8620a", fontSize: 13, textDecoration: "none" }}>← All Events</Link>
      <div style={{ marginTop: 12 }}>
        <Button size="sm" variant="secondary" onClick={load}>Retry</Button>
      </div>
    </div>
  );

  const ev    = data.event;
  const reg   = data.registrations;
  const cap   = data.capacity;
  const rev   = data.revenue;
  const emails= data.emails;
  const races = data.races;
  const badge = getBadge(ev);
  const isPub = ev.status === "published";
  const capPct= cap.max && cap.max > 0 ? safePct(cap.filled, cap.max) : 0;

  // ── Layout ───────────────────────────────────────────────────────────────────
  // KEY DESIGN DECISION:
  // The admin layout (app/admin/layout.tsx) already provides:
  //   - A fixed sidebar (228px or 58px)
  //   - A sticky desktop topbar (52px, zIndex: 30)
  //   - marginLeft on cs-main
  //
  // The Event Hub must NOT add:
  //   - Another minHeight: 100vh wrapper (causes blank space)
  //   - overflowY: auto on main (creates nested scroll container)
  //   - position: sticky at top: 0 (conflicts with admin topbar at top: 0)
  //
  // Instead: render a flat two-column layout, let the PAGE body scroll,
  // sticky elements use top: 52px to dock below the admin topbar.

  return (
    <div style={{ display: "flex", background: "#0a0a0a", color: "#fff" }}>

      {/* ── Event-specific sidebar ────────────────────────────────────────── */}
      {/* sticky top:52px = docks below the 52px admin desktop topbar */}
      <aside style={{
        width: 200, flexShrink: 0,
        background: "#0d0d0d",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        position: "sticky",
        top: 52,                            // admin topbar height
        height: "calc(100vh - 52px)",       // fill remaining viewport below topbar
        overflowY: "auto",
        display: "flex", flexDirection: "column",
      }}>
        {/* Event info */}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>{ev.title}</div>
          <div style={{ fontSize: 10, color: "#555" }}>{ev.start_date ? fmtDate(ev.start_date) : ""}</div>
          {(ev.distance_categories?.length ?? 0) > 0 && (
            <div style={{ fontSize: 10, color: "#e8620a", marginTop: 3 }}>{ev.distance_categories!.join(" · ")}</div>
          )}
          <div style={{ marginTop: 8 }}>
            <Badge size="sm" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</Badge>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ padding: "6px 8px", flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const active = item.inline && tab === item.key;
            const href   = "href" in item ? `/admin/events/${eventId}/${item.href}` : null;
            const s: React.CSSProperties = {
              display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
              borderRadius: 7, marginBottom: 1, fontSize: 12,
              fontWeight: active ? 700 : 400, color: active ? "#fff" : "#777",
              background: active ? "rgba(232,98,10,0.12)" : "transparent",
              border: active ? "1px solid rgba(232,98,10,0.2)" : "1px solid transparent",
              cursor: "pointer", textDecoration: "none", fontFamily: "inherit", width: "100%",
            };
            if (href) return <Link key={item.key} href={href} style={s}><span>{item.icon}</span>{item.label}</Link>;
            return <button key={item.key} onClick={() => setTab(item.key as TabKey)} style={s}><span>{item.icon}</span>{item.label}</button>;
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <Button size="xs" variant="ghost" onClick={load}>↻ Refresh</Button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Event sub-header — sticky at 52px, below admin topbar */}
        <div style={{
          position: "sticky",
          top: 52,
          zIndex: 20,                        // below admin topbar zIndex:30
          background: "rgba(10,10,10,0.98)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          height: 48,
          display: "flex", alignItems: "center", padding: "0 1.25rem", gap: 10, flexShrink: 0,
        }}>
          <Link href="/admin/events" style={{ color: "#555", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>← Events</Link>
          <span style={{ color: "#222" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ev.title}</span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {ev.share_slug && (
              <Link href={`/events/${ev.share_slug}`} target="_blank">
                <Button size="xs" variant="ghost">Preview ↗</Button>
              </Link>
            )}
            <Link href={`/admin/events/${eventId}/edit`}>
              <Button size="xs" variant="secondary">Edit</Button>
            </Link>
            <Button size="xs" variant={isPub ? "danger" : "primary"} onClick={togglePublish}>
              {isPub ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>

        {/* Tab content — plain block, page scrolls naturally */}
        <div style={{ padding: "1.25rem 1.5rem" }}>

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div style={{ maxWidth: 900 }}>

              <SectionBoundary title="Participants">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Participants" action={
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={load} title="Refresh" style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>↻</button>
                      <Link href={`/admin/events/${eventId}/registrations`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
                    </div>
                  } />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
                    <EventStatCard label="Total"      value={fmt(reg.total)}      />
                    <EventStatCard label="Confirmed"  value={fmt(reg.confirmed)}  color="#4ade80" accent />
                    <EventStatCard label="Paid"       value={fmt(reg.paid)}       color="#4ade80" />
                    <EventStatCard label="Free"       value={fmt(reg.free)}       color="#60a5fa" />
                    <EventStatCard label="Pending"    value={fmt(reg.pending)}    color={reg.pending > 0 ? "#fbbf24" : "#555"} accent={reg.pending > 0} />
                    <EventStatCard label="Checked In" value={fmt(reg.checked_in)} color="#a78bfa" accent />
                    <EventStatCard label="Cancelled"  value={fmt(reg.cancelled)}  color={reg.cancelled > 0 ? "#f87171" : "#555"} />
                  </div>
                </div>
              </SectionBoundary>

              {cap.max !== null && (
                <SectionBoundary title="Capacity">
                  <div style={{ marginBottom: 18 }}>
                    <SecHead title="Capacity" />
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1rem 1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 24, fontWeight: 800, color: capPct >= 90 ? "#f87171" : "#fff" }}>{fmt(cap.filled)}</span>
                          <span style={{ fontSize: 12, color: "#555", marginLeft: 4 }}>/ {fmt(cap.max!)}</span>
                        </div>
                        <span style={{ fontSize: 17, fontWeight: 700, color: capPct >= 90 ? "#f87171" : "#4ade80" }}>{capPct}%</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(capPct, 100)}%`, background: capPct >= 90 ? "#f87171" : capPct >= 70 ? "#fbbf24" : "#e8620a", borderRadius: 3 }} />
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                        <span style={{ color: "#4ade80", fontWeight: 700 }}>{fmt(cap.remaining ?? 0)}</span> remaining
                        {capPct >= 90 && <span style={{ color: "#f87171", fontWeight: 600, marginLeft: 12 }}>⚠ Almost full</span>}
                      </div>
                    </div>
                  </div>
                </SectionBoundary>
              )}

              <SectionBoundary title="Revenue">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Revenue" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <EventStatCard label="Collected" value={fmtInr(rev.collected)} color="#e8620a" accent />
                    <EventStatCard label="Pending"   value={fmtInr(rev.pending)}   color={rev.pending > 0 ? "#fbbf24" : "#555"} accent={rev.pending > 0} />
                  </div>
                </div>
              </SectionBoundary>

              <SectionBoundary title="Communication">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Communication" action={
                    <Link href={`/admin/events/${eventId}/communicate`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>Open Hub →</Link>
                  } />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 10 }}>
                    <EventStatCard label="Campaigns"   value={fmt(emails.campaigns)}             />
                    <EventStatCard label="Confirm. ✓"  value={fmt(emails.confirmation_sent)}   color="#4ade80" accent={emails.confirmation_sent > 0} />
                    <EventStatCard label="Confirm. ✗"  value={fmt(emails.confirmation_failed)} color={emails.confirmation_failed > 0 ? "#f87171" : "#555"} />
                    <EventStatCard label="Bulk Sent"   value={fmt(emails.campaign_delivered)}  color="#4ade80" accent={emails.campaign_delivered > 0} />
                  </div>
                  {data.recent_comms.length > 0 && (
                    <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
                      {data.recent_comms.slice(0, 3).map((c, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, padding: "8px 12px", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.subject}</div>
                            <div style={{ fontSize: 10, color: "#555" }}>
                              {new Date(c.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.recipients ?? 0}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: "#4ade80", flexShrink: 0 }}>✓ {c.sent ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionBoundary>

              <SectionBoundary title="Quick Actions">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Quick Actions" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                    {[
                      { label: "Registrations",    icon: "👥", href: `/admin/events/${eventId}/registrations` },
                      { label: "Communicate",      icon: "📢", href: `/admin/events/${eventId}/communicate`   },
                      { label: "Race Day",         icon: "🏃", href: `/admin/events/${eventId}/race-day`      },
                      { label: "BIB Collection",   icon: "📦", href: `/admin/events/${eventId}/bib`           },
                      { label: "Results",          icon: "🏅", href: `/admin/events/${eventId}/results`       },
                      { label: "Analytics",        icon: "📈", href: `/admin/events/${eventId}/analytics`     },
                      { label: "Register Walk-in", icon: "➕", href: `/admin/events/${eventId}/registrations?action=register` },
                      { label: "Participants",     icon: "🪪", href: `/admin/events/${eventId}/participants`  },
                      { label: "Volunteers",       icon: "🙋", href: `/admin/events/${eventId}/volunteers`    },
                      { label: "Services",         icon: "🔧", href: `/admin/events/${eventId}/services`      },
                      { label: "Edit Event",       icon: "✏️", href: `/admin/events/${eventId}/edit`          },
                    ].map(a => (
                      <Link key={a.label} href={a.href} style={{ textDecoration: "none" }}>
                        <Card hoverable style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "0.9rem 0.5rem" }}>
                          <span style={{ fontSize: 18 }}>{a.icon}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#777", textAlign: "center" as const }}>{a.label}</span>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              </SectionBoundary>
            </div>
          )}

          {/* ── RACES ────────────────────────────────────────────────────── */}
          {tab === "races" && (
            <SectionBoundary title="Races">
              <div style={{ maxWidth: 780 }}>
                <SecHead title={`Races (${races.length})`} action={<Link href={`/admin/events/new?edit=${eventId}`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>Edit in wizard →</Link>} />
                {races.length === 0 ? (
                  <EmptyState icon="🏁" title="No races configured."
                    action={<Link href={`/admin/events/new?edit=${eventId}`}><Button size="sm" variant="outline">Add races →</Button></Link>} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {races.map(r => (
                      <div key={r.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "0.9rem 1.1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                          <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 12, color: "#666" }}>
                            {r.distance && <span>📏 {r.distance}</span>}
                            {r.flag_off_time && <span>🏁 {r.flag_off_time}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#e8620a" }}>₹{r.price}</span>
                          {r.max_slots && <span style={{ fontSize: 12, color: "#555" }}>{r.max_slots} slots</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionBoundary>
          )}

          {/* ── FINANCE ──────────────────────────────────────────────────── */}
          {tab === "finance" && (
            <SectionBoundary title="Finance">
              <div style={{ maxWidth: 580 }}>
                <SecHead title="Finance Summary" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <EventStatCard label="Collected" value={fmtInr(rev.collected)} color="#e8620a" accent />
                  <EventStatCard label="Pending"   value={fmtInr(rev.pending)}   color={rev.pending > 0 ? "#fbbf24" : "#555"} />
                </div>
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        {["Category","Count","Amount"].map(h => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label:"Paid",    color:"#4ade80", count:reg.paid,    amount:fmtInr(rev.collected) },
                        { label:"Pending", color:"#fbbf24", count:reg.pending, amount:fmtInr(rev.pending)   },
                        { label:"Free",    color:"#60a5fa", count:reg.free,    amount:"₹0"                  },
                      ].map(row => (
                        <tr key={row.label} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"9px 14px", color:row.color, fontWeight:600 }}>{row.label}</td>
                          <td style={{ padding:"9px 14px", color:"#888" }}>{fmt(row.count)}</td>
                          <td style={{ padding:"9px 14px", fontWeight:700, color:"#e8620a" }}>{row.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionBoundary>
          )}

          {/* ── ANNOUNCE ─────────────────────────────────────────────────── */}
          {tab === "announce" && (
            <SectionBoundary title="Announce">
              <div style={{ maxWidth: 640 }}>
                <SecHead title="Announce to All Active Members" />

                {/* Step 1 — recipient preview */}
                {!annPreview ? (
                  <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1.25rem", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
                      Sends an event announcement to <strong style={{ color: "#fff" }}>all active members</strong> — not just registrants — via Email and/or WhatsApp.
                    </div>
                    <Button onClick={loadAnnouncePreview} loading={annLoading}>Check Recipients</Button>
                    {annError && <Alert variant="error" style={{ marginTop: 10 }}>{annError}</Alert>}
                  </div>
                ) : (
                  <>
                    {/* Recipient count */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                      {[
                        { label: "Active Members", value: annPreview.member_count, color: "#fff" },
                        { label: "Email",          value: annPreview.email_count,  color: "#60a5fa" },
                        { label: "WhatsApp",       value: annPreview.wa_count,     color: "#4ade80" },
                      ].map(s => <EventStatCard key={s.label} label={s.label} value={s.value} color={s.color} />)}
                    </div>

                    {/* Result banner */}
                    {annResult && (
                      <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>
                          ✅ Announcement sent!
                        </div>
                        {annResult.wa_total > 0 && (
                          <div style={{ fontSize: 13, color: "#aaa" }}>
                            WhatsApp: <strong style={{ color: "#4ade80" }}>{annResult.wa_total}</strong> messages queued
                          </div>
                        )}
                        {annResult.email_queued > 0 && (
                          <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>
                            Email:{" "}
                            {annPolling ? (
                              <span style={{ color: "#eab308" }}>Delivering… {annDelivered}/{annPollTotal}</span>
                            ) : (
                              <strong style={{ color: "#4ade80" }}>{annDelivered} delivered</strong>
                            )}
                          </div>
                        )}
                        <button onClick={() => { setAnnResult(null); setAnnPreview(null); setAnnDelivered(0); setAnnSubject(""); setAnnBody(""); }}
                          style={{ marginTop: 10, fontSize: 12, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                          Send another →
                        </button>
                      </div>
                    )}

                    {!annResult && (
                      <form onSubmit={sendAnnouncement} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                        {/* Channel toggles */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 8 }}>Channels</div>
                          <div style={{ display: "flex", gap: 10 }}>
                            {(["email", "whatsapp"] as const).map(ch => {
                              const on = annChannels.includes(ch);
                              return (
                                <button key={ch} type="button"
                                  onClick={() => setAnnChannels(prev => on ? prev.filter(c => c !== ch) : [...prev, ch])}
                                  style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${on ? (ch === "email" ? "rgba(96,165,250,0.5)" : "rgba(74,222,128,0.5)") : "rgba(255,255,255,0.1)"}`, background: on ? (ch === "email" ? "rgba(96,165,250,0.1)" : "rgba(74,222,128,0.1)") : "transparent", color: on ? (ch === "email" ? "#60a5fa" : "#4ade80") : "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                  {ch === "email" ? "📧 Email" : "💬 WhatsApp"}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* WhatsApp preview */}
                        {annChannels.includes("whatsapp") && (
                          <div style={{ background: "rgba(37,211,102,0.05)", border: "1px solid rgba(37,211,102,0.15)", borderRadius: 10, padding: "12px 14px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 8 }}>WhatsApp Preview (session_alert_v3 template)</div>
                            <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.7 }}>
                              <span style={{ color: "#4ade80" }}>Hi [Name],</span><br />
                              <em style={{ color: "#666" }}>[Template intro text]</em><br />
                              📌 <strong style={{ color: "#fff" }}>{ev.title}</strong><br />
                              📅 {ev.start_date ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                              {ev.start_time && (() => { const [h, m] = ev.start_time!.split(":").map(Number); return `, ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; })()}<br />
                              📍 {ev.location}
                            </div>
                            <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
                              Sent to {annPreview.wa_count} members with a saved phone number.
                            </div>
                          </div>
                        )}

                        {/* Email compose */}
                        {annChannels.includes("email") && (
                          <>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", display: "block", marginBottom: 6 }}>Subject</label>
                              <input value={annSubject} onChange={e => setAnnSubject(e.target.value)} required
                                style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
                            </div>

                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em" }}>Body</label>
                                <div style={{ fontSize: 10, color: "#444" }}>vars: {"{name} {event} {date} {time} {location} {register_link}"}</div>
                              </div>
                              <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} required rows={10}
                                style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, fontFamily: "monospace", outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const }} />
                            </div>
                          </>
                        )}

                        {annError && <Alert variant="error">{annError}</Alert>}

                        <Button type="submit" loading={annSending} disabled={!annChannels.length}>
                          📣 Send Announcement ({annPreview.member_count} members)
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </div>
            </SectionBoundary>
          )}

          {/* ── SETTINGS ─────────────────────────────────────────────────── */}
          {tab === "settings" && (
            <SectionBoundary title="Settings">
              <div style={{ maxWidth: 520 }}>
                <SecHead title="Event Settings" />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { icon: "✏️", label: "Edit Event Details",  desc: "Title, dates, location, media",    href: `/admin/events/${eventId}/edit` },
                    { icon: "📢", label: "Communication Hub",   desc: "Emails and push notifications",    href: `/admin/events/${eventId}/communicate` },
                    { icon: "💸", label: "Refund Policy",       desc: "Set cancellation & refund rules",  href: `/admin/events/${eventId}/refund-policy` },
                    { icon: "📈", label: "Analytics",           desc: "Registration trends",               href: `/admin/events/${eventId}/analytics` },
                    { icon: "🤝", label: "Sponsors",            desc: "Add and manage event sponsors",    href: `/admin/events/${eventId}/sponsors` },
                  ].map((item, i) => (
                    <Link key={i} href={item.href}
                      style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none" }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc" }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{item.desc}</div>
                      </div>
                      <span style={{ marginLeft: "auto", color: "#555", fontSize: 16 }}>›</span>
                    </Link>
                  ))}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <Button variant="ghost" fullWidth onClick={duplicateEvent}>📋 Duplicate Event</Button>
                    <Button variant="secondary" fullWidth onClick={archiveEvent}>{ev.status === "archived" ? "♻️ Restore Event" : "📦 Archive Event"}</Button>
                    <Button variant={isPub ? "danger" : "primary"} fullWidth onClick={togglePublish}>{isPub ? "⛔ Unpublish" : "🚀 Publish"}</Button>
                  </div>
                </div>
              </div>
            </SectionBoundary>
          )}

        </div>
      </div>
    </div>
  );
}
