"use client";

import { useState, useEffect, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLifecycle } from "@/lib/event-lifecycle";

// ── Section error boundary ─────────────────────────────────────────────────────
// Every inline section (Overview, Races, Finance, Settings) is wrapped in this.
// If one section crashes only that card fails — the rest of the page stays up.

class SectionBoundary extends Component<{ title: string; children: ReactNode }, { caught: boolean; msg: string }> {
  state = { caught: false, msg: "" };
  static getDerivedStateFromError(e: unknown) {
    return { caught: true, msg: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error(`[EventHub] Section "${this.props.title}" crashed:`, e.message, info.componentStack?.slice(0, 300));
  }
  render() {
    if (this.state.caught) {
      return (
        <div style={{ background: "#111", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "1.25rem", marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>⚠ Unable to load: {this.props.title}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{this.state.msg || "An unexpected error occurred in this section."}</div>
          <button onClick={() => this.setState({ caught: false, msg: "" })}
            style={{ marginTop: 8, fontSize: 11, color: "#e8620a", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
            Retry
          </button>
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
  registrations: {
    total: number; confirmed: number; pending: number; cancelled: number;
    paid: number; free: number; checked_in: number; active: number;
  };
  capacity:  { max: number | null; filled: number; remaining: number | null };
  revenue:   { collected: number; pending: number };
  emails:    { campaigns: number; confirmation_sent: number; confirmation_failed: number; campaign_delivered: number; campaign_failed: number; campaign_queued: number };
  races:     Array<{ id: string; name: string; distance: string; price: number; max_slots: number | null; status: string; gun_time: string | null; flag_off_time: string | null; report_time: string | null }>;
  recent_comms: Array<{ sent: number; failed: number; status: string; sent_at: string; subject: string; channel: string | null; recipients: number }>;
}

// ── Sidebar nav definition ─────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "overview",       icon: "⚡", label: "Overview",       inline: true  },
  { key: "registrations",  icon: "👥", label: "Registrations",  inline: false, href: "registrations" },
  { key: "races",          icon: "🏁", label: "Races",          inline: true  },
  { key: "communicate",    icon: "📢", label: "Communicate",    inline: false, href: "communicate"   },
  { key: "race-day",       icon: "🏃", label: "Race Day",       inline: false, href: "race-day"      },
  { key: "bib",            icon: "📦", label: "BIB Collection", inline: false, href: "bib"           },
  { key: "results",        icon: "🏅", label: "Results",        inline: false, href: "results"       },
  { key: "analytics",      icon: "📈", label: "Analytics",      inline: false, href: "analytics"     },
  { key: "sponsors",       icon: "🤝", label: "Sponsors",       inline: false, href: "sponsors"      },
  { key: "finance",        icon: "💰", label: "Finance",        inline: true  },
  { key: "settings",       icon: "⚙️", label: "Settings",       inline: true  },
] as const;

type TabKey = typeof NAV_ITEMS[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number)    { return n.toLocaleString("en-IN"); }
function fmtInr(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
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

interface StatusBadge { label: string; color: string; bg: string; border: string }

const FALLBACK_BADGE: StatusBadge = { label: "Published", color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)" };

const LIFECYCLE_BADGES: Record<string, StatusBadge> = {
  draft:                { label: "Draft",         color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  registration_not_open:{ label: "Reg. Not Open", color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)"   },
  registration_open:    { label: "Reg. Open",     color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.3)"   },
  registration_closed:  { label: "Reg. Closed",   color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)"   },
  event_live:           { label: "Live Now",       color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)"  },
  completed:            { label: "Completed",      color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  archived:             { label: "Archived",       color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)"  },
};

function getBadge(event: EventOverview["event"]): StatusBadge {
  if (!event) return FALLBACK_BADGE;
  if (event.status === "draft")    return LIFECYCLE_BADGES.draft;
  if (event.status === "archived") return LIFECYCLE_BADGES.archived;
  try {
    const lc = getLifecycle({
      start_date: event.start_date, start_time: event.start_time,
      end_date:   event.end_date,   end_time:   event.end_time,
      registration_closes_at: event.registration_closes_at,
    });
    return LIFECYCLE_BADGES[lc.state] ?? FALLBACK_BADGE;
  } catch { return FALLBACK_BADGE; }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color = "#fff", accent = false }: { label: string; value: string | number; color?: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? `${color}0d` : "#111", border: `1px solid ${accent ? `${color}22` : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "0.9rem 1rem" }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 6, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function SecHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{title}</div>
      {action}
    </div>
  );
}

function ProgBar({ value, max, color = "#e8620a" }: { value: number; max: number; color?: string }) {
  const p = safePct(value, max);
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(p, 100)}%`, background: p >= 90 ? "#f87171" : p >= 70 ? "#fbbf24" : color, borderRadius: 3 }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EventManagePage() {
  const { id: eventId } = useParams() as { id: string };

  const [data,     setData]     = useState<EventOverview | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [activeTab,setActiveTab]= useState<TabKey>("overview");
  const [navOpen,  setNavOpen]  = useState(false);

  const load = useCallback(async () => {
    if (!eventId) { setError("No event ID"); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/overview`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      // Safe extraction with fallbacks — no property access can throw here
      const normalized: EventOverview = {
        event:    json.event    ?? null,
        registrations: {
          total:     json.registrations?.total     ?? json.registrations?.total      ?? 0,
          confirmed: json.registrations?.confirmed ?? 0,
          pending:   json.registrations?.pending   ?? 0,
          cancelled: json.registrations?.cancelled ?? 0,
          paid:      json.registrations?.paid      ?? 0,
          free:      json.registrations?.free      ?? 0,
          checked_in:json.registrations?.checked_in ?? 0,
          active:    json.registrations?.active    ?? 0,
        },
        capacity:  json.capacity  ?? { max: null, filled: 0, remaining: null },
        revenue:   json.revenue   ?? { collected: 0, pending: 0 },
        emails:    json.emails    ?? { campaigns: 0, confirmation_sent: 0, confirmation_failed: 0, campaign_delivered: 0, campaign_failed: 0, campaign_queued: 0 },
        races:     json.races     ?? [],
        recent_comms: json.recent_comms ?? [],
      };

      if (!normalized.event) throw new Error("Event not found");
      setData(normalized);
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
    const res  = await fetch("/api/admin/events", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ id: eventId, status: next }),
    });
    if (res.ok) setData(d => d && d.event ? { ...d, event: { ...d.event, status: next } } : d);
  }

  async function duplicateEvent() {
    const t = prompt("New event title:", `${data?.event?.title ?? ""} (Copy)`);
    if (t === null) return;
    const withSponsors = confirm("Copy sponsors too?");
    const res  = await fetch(`/api/admin/events/${eventId}/duplicate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ new_title: t || undefined, include_sponsors: withSponsors }),
    });
    const d = await res.json() as { event_id?: string; title?: string; error?: string };
    if (res.ok && d.event_id) {
      if (confirm(`✅ "${d.title}" created. Go to it now?`)) window.location.href = `/admin/events/${d.event_id}/manage`;
    } else alert(`❌ ${d.error ?? "Duplicate failed"}`);
  }

  async function archiveEvent() {
    if (!data?.event) return;
    const isArchived = data.event.status === "archived";
    if (!confirm(`${isArchived ? "Restore" : "Archive"} this event?`)) return;
    const res = await fetch(`/api/admin/events/${eventId}/archive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ action: isArchived ? "restore" : "archive" }),
    });
    const d = await res.json() as { status?: string; error?: string };
    if (res.ok && d.status) setData(ov => ov && ov.event ? { ...ov, event: { ...ov.event, status: d.status! } } : ov);
    else alert(`❌ ${d.error}`);
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 13 }}>
      Loading event hub…
    </div>
  );

  // ── Error / not found ─────────────────────────────────────────────────────────
  if (error || !data || !data.event) return (
    <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>😕</div>
        <div style={{ color: "#f87171", marginBottom: 8, fontSize: 14 }}>{error || "Event not found"}</div>
        <Link href="/admin/events" style={{ color: "#e8620a", fontSize: 13, textDecoration: "none" }}>← Back to all events</Link>
        <div style={{ marginTop: 12 }}>
          <button onClick={load} style={{ fontSize: 12, color: "#888", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );

  // ── Guaranteed non-null beyond this point ─────────────────────────────────────
  const event  = data.event;
  const reg    = data.registrations;
  const cap    = data.capacity;
  const rev    = data.revenue;
  const emails = data.emails;
  const races  = data.races;
  const badge  = getBadge(event);
  const isPub  = event.status === "published";
  const capPct = (cap.max && cap.max > 0) ? safePct(cap.filled, cap.max) : 0;

  // ── Page ──────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* CSS is the ONLY correct way to handle responsive sidebar — never window.innerWidth in JSX */}
      <style>{`
        .cs-hub-aside { position: sticky; top: 56px; height: calc(100vh - 56px); }
        .cs-hub-nav-overlay { display: none; }
        @media (max-width: 767px) {
          .cs-hub-aside {
            position: fixed; top: 56px; left: -210px; height: 100vh; z-index: 40;
            transition: left 0.22s ease;
          }
          .cs-hub-aside.open { left: 0; }
          .cs-hub-nav-overlay { display: block; }
        }
      `}</style>

      {/* Mobile nav overlay */}
      {navOpen && (
        <div className="cs-hub-nav-overlay" onClick={() => setNavOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 39, background: "rgba(0,0,0,0.6)" }} />
      )}

      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit", display: "flex", flexDirection: "column" }}>

        {/* Sticky header */}
        <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(10,10,10,0.98)", borderBottom: "1px solid rgba(255,255,255,0.07)", height: 56, display: "flex", alignItems: "center", padding: "0 1.25rem", gap: 10, flexShrink: 0 }}>
          <button onClick={() => setNavOpen(o => !o)}
            style={{ display: "none", background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, flexShrink: 0 }}
            className="cs-hub-hamburger">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <Link href="/admin/events" style={{ color: "#555", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>← Events</Link>
          <span style={{ color: "#333" }}>/</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: "nowrap", flexShrink: 0 }}>
              {badge.label}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {event.share_slug && (
              <Link href={`/events/${event.share_slug}`} target="_blank"
                style={{ padding: "5px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                Preview ↗
              </Link>
            )}
            <Link href={`/admin/events/new?edit=${eventId}`}
              style={{ padding: "5px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              Edit
            </Link>
            <button onClick={togglePublish}
              style={{ padding: "5px 14px", background: isPub ? "rgba(239,68,68,0.12)" : "#e8620a", border: "none", borderRadius: 6, color: isPub ? "#f87171" : "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {isPub ? "Unpublish" : "Publish"}
            </button>
          </div>
        </header>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* Sidebar — CSS handles mobile/desktop, no window.innerWidth */}
          <aside className={`cs-hub-aside${navOpen ? " open" : ""}`}
            style={{ width: 200, flexShrink: 0, background: "#0d0d0d", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>{event.title}</div>
              <div style={{ fontSize: 10, color: "#555" }}>{event.start_date ? fmtDate(event.start_date) : ""}</div>
              {(event.distance_categories?.length ?? 0) > 0 && (
                <div style={{ fontSize: 10, color: "#e8620a", marginTop: 3 }}>{event.distance_categories!.join(" · ")}</div>
              )}
            </div>
            <nav style={{ padding: "6px 8px", flex: 1 }}>
              {NAV_ITEMS.map(item => {
                const isActive = item.inline && activeTab === item.key;
                const href     = "href" in item ? `/admin/events/${eventId}/${item.href}` : null;
                const s: React.CSSProperties = {
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                  borderRadius: 7, marginBottom: 1, fontSize: 13,
                  fontWeight: isActive ? 700 : 400, color: isActive ? "#fff" : "#888",
                  background: isActive ? "rgba(232,98,10,0.12)" : "transparent",
                  border: isActive ? "1px solid rgba(232,98,10,0.2)" : "1px solid transparent",
                  cursor: "pointer", textDecoration: "none", fontFamily: "inherit", width: "100%", transition: "all 0.15s",
                };
                if (href) {
                  return <Link key={item.key} href={href} style={s}><span style={{ fontSize: 13 }}>{item.icon}</span>{item.label}</Link>;
                }
                return (
                  <button key={item.key} onClick={() => { setActiveTab(item.key as TabKey); setNavOpen(false); }} style={s}>
                    <span style={{ fontSize: 13 }}>{item.icon}</span>{item.label}
                  </button>
                );
              })}
            </nav>
            <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 5 }}>
              <button onClick={load} style={{ fontSize: 11, color: "#555", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0 }}>↻ Refresh</button>
            </div>
          </aside>

          {/* Main content — each section in its own SectionBoundary */}
          <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "1.5rem" }}>

            {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
            {activeTab === "overview" && (
              <div style={{ maxWidth: 960, margin: "0 auto" }}>

                {/* Event hero */}
                <SectionBoundary title="Event Info">
                  <div style={{ background: "linear-gradient(135deg,#111 0%,#1a0a00 100%)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" as const }}>
                    {event.cover_image ? (
                      <img src={event.cover_image} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: 10, background: "rgba(232,98,10,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Image src="/logo.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{event.title}</div>
                      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#666", flexWrap: "wrap" as const }}>
                        {event.start_date && <span>📅 {fmtDate(event.start_date)}{event.start_time ? ` · ${fmtTime(event.start_time)}` : ""}</span>}
                        {event.location   && <span>📍 {event.location}</span>}
                        {(event.price ?? 0) > 0 && <span>💰 ₹{event.price}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0 }}>
                      {badge.label}
                    </span>
                  </div>
                </SectionBoundary>

                {/* Participants */}
                <SectionBoundary title="Participants">
                  <div style={{ marginBottom: 20 }}>
                    <SecHead title="Participants" action={
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={load} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "2px 4px", borderRadius: 4 }} title="Refresh">↻</button>
                        <Link href={`/admin/events/${eventId}/registrations`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
                      </div>
                    } />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
                      <StatCard label="Total"      value={fmt(reg.total)}      />
                      <StatCard label="Confirmed"  value={fmt(reg.confirmed)}  color="#4ade80" accent />
                      <StatCard label="Paid"       value={fmt(reg.paid)}       color="#4ade80" />
                      <StatCard label="Free"       value={fmt(reg.free)}       color="#60a5fa" />
                      <StatCard label="Pending"    value={fmt(reg.pending)}    color={reg.pending > 0 ? "#fbbf24" : "#555"} accent={reg.pending > 0} />
                      <StatCard label="Checked In" value={fmt(reg.checked_in)} color="#a78bfa" accent />
                      <StatCard label="Cancelled"  value={fmt(reg.cancelled)}  color={reg.cancelled > 0 ? "#f87171" : "#555"} />
                    </div>
                  </div>
                </SectionBoundary>

                {/* Capacity */}
                {cap.max !== null && (
                  <SectionBoundary title="Capacity">
                    <div style={{ marginBottom: 20 }}>
                      <SecHead title="Capacity" />
                      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div>
                            <span style={{ fontSize: 26, fontWeight: 800, color: capPct >= 90 ? "#f87171" : "#fff" }}>{fmt(cap.filled)}</span>
                            <span style={{ fontSize: 13, color: "#555", marginLeft: 4 }}>/ {fmt(cap.max!)}</span>
                          </div>
                          <div style={{ textAlign: "right" as const }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: capPct >= 90 ? "#f87171" : "#4ade80" }}>{capPct}%</div>
                            <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: ".07em" }}>filled</div>
                          </div>
                        </div>
                        <ProgBar value={cap.filled} max={cap.max!} />
                        <div style={{ marginTop: 8, fontSize: 12 }}>
                          <span style={{ color: "#555" }}><span style={{ color: "#4ade80", fontWeight: 700 }}>{fmt(cap.remaining ?? 0)}</span> remaining</span>
                          {capPct >= 90 && <span style={{ color: "#f87171", fontWeight: 600, marginLeft: 12 }}>⚠ Almost full</span>}
                        </div>
                      </div>
                    </div>
                  </SectionBoundary>
                )}

                {/* Revenue */}
                <SectionBoundary title="Revenue">
                  <div style={{ marginBottom: 20 }}>
                    <SecHead title="Revenue" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <StatCard label="Collected" value={fmtInr(rev.collected)} color="#e8620a" accent />
                      <StatCard label="Pending"   value={fmtInr(rev.pending)}   color={rev.pending > 0 ? "#fbbf24" : "#555"} accent={rev.pending > 0} />
                    </div>
                  </div>
                </SectionBoundary>

                {/* Email summary */}
                <SectionBoundary title="Communication">
                  <div style={{ marginBottom: 20 }}>
                    <SecHead title="Communication" action={
                      <Link href={`/admin/events/${eventId}/communicate`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>Open Hub →</Link>
                    } />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 12 }}>
                      <StatCard label="Campaigns"     value={fmt(emails.campaigns)}             />
                      <StatCard label="Confirmation ✓" value={fmt(emails.confirmation_sent)}   color="#4ade80" accent={emails.confirmation_sent > 0} />
                      <StatCard label="Confirmation ✗" value={fmt(emails.confirmation_failed)} color={emails.confirmation_failed > 0 ? "#f87171" : "#555"} />
                      <StatCard label="Bulk Delivered" value={fmt(emails.campaign_delivered)}  color="#4ade80" accent={emails.campaign_delivered > 0} />
                    </div>
                    {data.recent_comms.length > 0 && (
                      <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
                        {data.recent_comms.slice(0, 3).map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.subject}</div>
                              <div style={{ fontSize: 10, color: "#555" }}>
                                {new Date(c.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                {" · "}{c.recipients ?? 0} recipients
                              </div>
                            </div>
                            <div style={{ fontSize: 11, flexShrink: 0 }}>
                              <span style={{ color: "#4ade80" }}>✓ {c.sent ?? 0}</span>
                              {(c.failed ?? 0) > 0 && <span style={{ color: "#f87171", marginLeft: 8 }}>✗ {c.failed}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionBoundary>

                {/* Quick actions */}
                <SectionBoundary title="Quick Actions">
                  <div style={{ marginBottom: 20 }}>
                    <SecHead title="Quick Actions" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                      {[
                        { label: "Registrations",      icon: "👥", href: `/admin/events/${eventId}/registrations` },
                        { label: "Communicate",        icon: "📢", href: `/admin/events/${eventId}/communicate`   },
                        { label: "Race Day",           icon: "🏃", href: `/admin/events/${eventId}/race-day`      },
                        { label: "BIB Collection",     icon: "📦", href: `/admin/events/${eventId}/bib`           },
                        { label: "Results",            icon: "🏅", href: `/admin/events/${eventId}/results`       },
                        { label: "Analytics",          icon: "📈", href: `/admin/events/${eventId}/analytics`     },
                        { label: "Register Walk-in",   icon: "➕", href: `/admin/events/${eventId}/registrations?action=register` },
                        { label: "Edit Event",         icon: "✏️", href: `/admin/events/new?edit=${eventId}`     },
                      ].map(a => (
                        <Link key={a.label} href={a.href}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, padding: "1rem 0.5rem", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none" }}>
                          <span style={{ fontSize: 20 }}>{a.icon}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#888", textAlign: "center" as const }}>{a.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </SectionBoundary>
              </div>
            )}

            {/* ── RACES ────────────────────────────────────────────────────── */}
            {activeTab === "races" && (
              <SectionBoundary title="Races">
                <div style={{ maxWidth: 800, margin: "0 auto" }}>
                  <SecHead title={`Races (${races.length})`} action={
                    <Link href={`/admin/events/new?edit=${eventId}`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>Edit in wizard →</Link>
                  } />
                  {races.length === 0 ? (
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "3rem", textAlign: "center" as const }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>🏁</div>
                      <div style={{ fontSize: 13, color: "#555" }}>No races configured yet.</div>
                      <Link href={`/admin/events/new?edit=${eventId}`} style={{ fontSize: 12, color: "#e8620a", textDecoration: "none", fontWeight: 600, display: "inline-block", marginTop: 10 }}>Add races in wizard →</Link>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {races.map(r => (
                        <div key={r.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                            <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12, color: "#666" }}>
                              {r.distance       && <span>📏 {r.distance}</span>}
                              {r.report_time    && <span>🕐 Report {r.report_time}</span>}
                              {r.flag_off_time  && <span>🏁 Flag-off {r.flag_off_time}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#e8620a" }}>₹{r.price}</span>
                            {r.max_slots && <span style={{ fontSize: 12, color: "#555" }}>{r.max_slots} slots</span>}
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: r.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.05)", color: r.status === "active" ? "#4ade80" : "#555", textTransform: "uppercase" as const }}>
                              {r.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionBoundary>
            )}

            {/* ── FINANCE ──────────────────────────────────────────────────── */}
            {activeTab === "finance" && (
              <SectionBoundary title="Finance">
                <div style={{ maxWidth: 640, margin: "0 auto" }}>
                  <SecHead title="Finance Summary" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                    <StatCard label="Revenue Collected" value={fmtInr(rev.collected)} color="#e8620a" accent />
                    <StatCard label="Pending Payment"   value={fmtInr(rev.pending)}   color={rev.pending > 0 ? "#fbbf24" : "#555"} />
                  </div>
                  <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                          {["Category", "Count", "Amount"].map(h => (
                            <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "Paid",    color: "#4ade80", count: reg.paid,    amount: fmtInr(rev.collected) },
                          { label: "Pending", color: "#fbbf24", count: reg.pending, amount: fmtInr(rev.pending)   },
                          { label: "Free",    color: "#60a5fa", count: reg.free,    amount: "₹0"                  },
                        ].map(row => (
                          <tr key={row.label} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "10px 14px", color: row.color, fontWeight: 600 }}>{row.label}</td>
                            <td style={{ padding: "10px 14px", color: "#888" }}>{fmt(row.count)}</td>
                            <td style={{ padding: "10px 14px", fontWeight: 700, color: "#e8620a" }}>{row.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionBoundary>
            )}

            {/* ── SETTINGS ─────────────────────────────────────────────────── */}
            {activeTab === "settings" && (
              <SectionBoundary title="Settings">
                <div style={{ maxWidth: 540, margin: "0 auto" }}>
                  <SecHead title="Event Settings" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { icon: "✏️", label: "Edit Event Details",   desc: "Title, dates, location, description, media", href: `/admin/events/new?edit=${eventId}` },
                      { icon: "📢", label: "Communication Hub",    desc: "Send emails, push notifications",            href: `/admin/events/${eventId}/communicate` },
                      { icon: "📈", label: "Analytics",            desc: "Registration trends and conversion",          href: `/admin/events/${eventId}/analytics` },
                      { icon: "🤝", label: "Sponsors",             desc: "Add and manage event sponsors",              href: `/admin/events/${eventId}/sponsors` },
                    ].map((item, i) => (
                      <Link key={i} href={item.href}
                        style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none" }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc" }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{item.desc}</div>
                        </div>
                        <span style={{ marginLeft: "auto", color: "#555", fontSize: 16 }}>›</span>
                      </Link>
                    ))}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <button onClick={duplicateEvent}
                        style={{ width: "100%", padding: "12px 16px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 10, color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                        📋 Duplicate Event
                      </button>
                      <button onClick={archiveEvent}
                        style={{ width: "100%", padding: "12px 16px", background: "rgba(107,114,128,0.06)", border: "1px solid rgba(107,114,128,0.18)", borderRadius: 10, color: "#9ca3af", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                        {event.status === "archived" ? "♻️ Restore Event" : "📦 Archive Event"}
                      </button>
                      <button onClick={togglePublish}
                        style={{ width: "100%", padding: "12px 16px", background: isPub ? "rgba(239,68,68,0.08)" : "rgba(74,222,128,0.08)", border: `1px solid ${isPub ? "rgba(239,68,68,0.2)" : "rgba(74,222,128,0.2)"}`, borderRadius: 10, color: isPub ? "#f87171" : "#4ade80", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                        {isPub ? "⛔ Unpublish Event" : "🚀 Publish Event"}
                      </button>
                    </div>
                  </div>
                </div>
              </SectionBoundary>
            )}

          </main>
        </div>
      </div>
    </>
  );
}
