"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLifecycle } from "@/lib/event-lifecycle";

// ── Types ──────────────────────────────────────────────────────────────────────
// HubData is the shape returned by /api/admin/events/[id]/stats (single source of truth)

interface EventStats {
  total: number; confirmed: number; cancelled: number; pending: number;
  paid: number; free: number; checked_in: number;
  bib_collected: number; breakfast: number; certificates: number;
  revenue_collected: number; revenue_pending: number; avg_per_paid: number;
  email_sent: number; email_failed: number; email_none: number;
  campaign_delivered: number; campaign_failed: number; campaign_queued: number; campaigns: number;
  capacity_max: number | null; capacity_filled: number; capacity_remaining: number | null; capacity_pct: number | null;
  finishers: number; dnf: number; dns: number;
  by_category: Record<string, { total: number; paid: number; revenue: number; checked_in: number }>;
  timeline: Array<{ date: string; count: number }>;
  computed_at: string;
}

interface HubData {
  event: {
    id: string; title: string; status: string;
    start_date: string; start_time: string | null;
    end_date: string | null; end_time: string | null;
    location: string; max_participants: number | null;
    price: number; cover_image: string | null;
    registration_closes_at: string | null;
    distance_categories: string[] | null;
    featured: boolean; share_slug: string | null;
  };
  stats:        EventStats;
  races:        Array<{ id: string; name: string; distance: string; price: number; max_slots: number | null; status: string; gun_time: string | null; flag_off_time: string | null; report_time: string | null }>;
  recent_comms: Array<{ sent: number; failed: number; status: string; sent_at: string; subject: string; channel: string | null; recipients: number }>;
}

// Backward-compat shim so existing JSX that references data.registrations still works
type OverviewData = HubData & {
  registrations: EventStats; // alias for stats
  capacity:      { max: number | null; filled: number; remaining: number | null };
  revenue:       { collected: number; pending: number };
  emails:        { campaigns: number; confirmation_sent: number; confirmation_failed: number; campaign_delivered: number; campaign_failed: number; campaign_queued: number };
};

// ── Sidebar navigation definition ─────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "overview",    icon: "⚡", label: "Overview",       href: null,    inline: true  },
  { key: "registrations", icon: "👥", label: "Registrations", href: "registrations", inline: false },
  { key: "races",       icon: "🏁", label: "Races",          href: null,    inline: true  },
  { key: "communicate", icon: "📢", label: "Communicate",    href: "communicate",   inline: false },
  { key: "race-day",    icon: "🏃", label: "Race Day",       href: "race-day",      inline: false },
  { key: "bib",         icon: "📦", label: "BIB Collection", href: "bib",           inline: false },
  { key: "results",     icon: "🏅", label: "Results",        href: "results",       inline: false },
  { key: "analytics",   icon: "📈", label: "Analytics",      href: "analytics",     inline: false },
  { key: "sponsors",    icon: "🤝", label: "Sponsors",       href: "sponsors",      inline: false },
  { key: "finance",     icon: "💰", label: "Finance",        href: null,    inline: true  },
  { key: "settings",    icon: "⚙️", label: "Settings",       href: null,    inline: true  },
] as const;

type NavKey = typeof NAV_ITEMS[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString("en-IN"); }
function fmtInr(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "#fff", accent = false }: {
  label: string; value: string | number; sub?: string; color?: string; accent?: boolean;
}) {
  return (
    <div style={{ background: accent ? `${color}0d` : "#111", border: `1px solid ${accent ? `${color}22` : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "1rem 1.15rem" }}>
      <div style={{ fontSize: "1.65rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 6, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{title}</div>
      {action}
    </div>
  );
}

function ProgressBar({ value, max, color = "#e8620a" }: { value: number; max: number; color?: string }) {
  const p = pct(value, max);
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(p, 100)}%`, background: p >= 90 ? "#f87171" : p >= 70 ? "#fbbf24" : color, borderRadius: 3, transition: "width 0.5s" }} />
    </div>
  );
}

// ── Event status from lifecycle ────────────────────────────────────────────────

const LIFECYCLE_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:                { label: "Draft",         color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  registration_not_open:{ label: "Reg. Not Open", color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)"  },
  registration_open:    { label: "Reg. Open",     color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.3)"  },
  registration_closed:  { label: "Reg. Closed",   color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)"  },
  event_live:           { label: "Live Now",       color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)" },
  completed:            { label: "Completed",      color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
};
const FALLBACK_BADGE = { label: "Published", color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)" };

function getEventStatusBadge(data: OverviewData) {
  const { event } = data;
  if (event.status !== "published") return LIFECYCLE_BADGE.draft ?? FALLBACK_BADGE;
  try {
    const lc = getLifecycle({
      start_date: event.start_date, start_time: event.start_time,
      end_date: event.end_date,     end_time: event.end_time,
      registration_closes_at: event.registration_closes_at,
    });
    return LIFECYCLE_BADGE[lc.state] ?? FALLBACK_BADGE;
  } catch {
    return FALLBACK_BADGE;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EventManagePage() {
  const { id: eventId } = useParams() as { id: string };

  const [data,     setData]     = useState<OverviewData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [activeTab, setActiveTab] = useState<NavKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use the shared stats endpoint — single source of truth for all metrics
      const res  = await fetch(`/api/admin/events/${eventId}/stats`);
      const json = await res.json() as HubData;
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");

      // Normalise into the shape the JSX expects (backward-compat shim)
      const s = json.stats;
      setData({
        ...json,
        registrations: s,
        capacity:      { max: s.capacity_max, filled: s.capacity_filled, remaining: s.capacity_remaining },
        revenue:       { collected: s.revenue_collected, pending: s.revenue_pending },
        emails: {
          campaigns:             s.campaigns,
          confirmation_sent:     s.email_sent,
          confirmation_failed:   s.email_failed,
          campaign_delivered:    s.campaign_delivered,
          campaign_failed:       s.campaign_failed,
          campaign_queued:       s.campaign_queued,
        },
      } as OverviewData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function togglePublish() {
    if (!data?.event) return;
    const newStatus = data.event.status === "published" ? "draft" : "published";
    await fetch("/api/admin/events", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId, status: newStatus }),
    });
    setData(d => d ? { ...d, event: { ...d.event, status: newStatus } } : d);
  }

  async function duplicateEvent() {
    const newTitle = prompt("New event title:", `${data?.event.title} (Copy)`);
    if (newTitle === null) return; // cancelled
    const incSponsors = confirm("Copy sponsors too?");
    const res  = await fetch(`/api/admin/events/${eventId}/duplicate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_title: newTitle || undefined, include_sponsors: incSponsors }),
    });
    const result = await res.json() as { event_id?: string; title?: string; error?: string };
    if (res.ok && result.event_id) {
      if (confirm(`✅ "${result.title}" created as draft. Go to new event hub?`)) {
        window.location.href = `/admin/events/${result.event_id}/manage`;
      }
    } else {
      alert(`❌ ${result.error ?? "Duplicate failed"}`);
    }
  }

  async function archiveEvent() {
    if (!data?.event) return;
    const isArchived = data.event.status === "archived";
    const action     = isArchived ? "restore" : "archive";
    if (!confirm(`${isArchived ? "Restore" : "Archive"} this event?`)) return;
    const res = await fetch(`/api/admin/events/${eventId}/archive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await res.json() as { status?: string; error?: string };
    if (res.ok) setData(d => d ? { ...d, event: { ...d.event, status: result.status ?? d.event.status } } : d);
    else alert(`❌ ${result.error}`);
  }

  function navClick(item: typeof NAV_ITEMS[number]) {
    if (item.inline) {
      setActiveTab(item.key as NavKey);
      setSidebarOpen(false);
    }
    // href items use <Link> — handled below
  }

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 14 }}>
      Loading event…
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#f87171", marginBottom: 8 }}>{error || "Event not found"}</div>
        <Link href="/admin/events" style={{ color: "#e8620a", fontSize: 13 }}>← Back to events</Link>
      </div>
    </div>
  );

  const { event, registrations: reg, capacity: cap, revenue: rev, emails, races } = data;
  const badge     = getEventStatusBadge(data);
  const isPublished = event.status === "published";
  const capPct    = cap.max ? pct(cap.filled, cap.max) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit", display: "flex", flexDirection: "column" }}>

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(10,10,10,0.98)", borderBottom: "1px solid rgba(255,255,255,0.07)", height: 56, display: "flex", alignItems: "center", padding: "0 1.25rem", gap: 12 }}>

        {/* Mobile hamburger */}
        <button onClick={() => setSidebarOpen(o => !o)} style={{ display: "flex", background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, flexShrink: 0 }} className="md-hide">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <Link href="/admin/events" style={{ color: "#555", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>← Events</Link>
        <span style={{ color: "#222" }}>/</span>

        {/* Event title + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: "nowrap", flexShrink: 0 }}>
            {badge.label}
          </span>
        </div>

        {/* Header actions */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {event.share_slug && (
            <Link href={`/events/${event.share_slug}`} target="_blank" style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              Preview ↗
            </Link>
          )}
          <Link href={`/admin/events/new?edit=${eventId}`} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            Edit
          </Link>
          <button onClick={togglePublish} style={{ padding: "5px 14px", background: isPublished ? "rgba(239,68,68,0.12)" : "#e8620a", border: "none", borderRadius: 6, color: isPublished ? "#f87171" : "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {isPublished ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + main ────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1 }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <>
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          )}

          <aside style={{
            width: 200, flexShrink: 0,
            background: "#0d0d0d", borderRight: "1px solid rgba(255,255,255,0.06)",
            display: "flex", flexDirection: "column",
            position: "sticky" as const, top: 56, height: "calc(100vh - 56px)", overflowY: "auto",
            // Mobile: slide in/out
            ...(typeof window !== "undefined" && window.innerWidth < 768 ? {
              position: "fixed" as const, top: 56, left: sidebarOpen ? 0 : -220, zIndex: 40,
              transition: "left 0.25s", height: "100vh",
            } : {}),
          }}>
            {/* Event mini-card */}
            <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>{event.title}</div>
              <div style={{ fontSize: 10, color: "#555" }}>
                {event.start_date ? fmtDate(event.start_date) : ""}
              </div>
              {event.distance_categories?.length ? (
                <div style={{ fontSize: 10, color: "#e8620a", marginTop: 3 }}>{event.distance_categories.join(" · ")}</div>
              ) : null}
            </div>

            {/* Nav */}
            <nav style={{ padding: "8px 8px", flex: 1 }}>
              {NAV_ITEMS.map(item => {
                const isActive = item.inline && activeTab === item.key;
                const fullHref = item.href ? `/admin/events/${eventId}/${item.href}` : null;
                const style: React.CSSProperties = {
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "8px 10px", borderRadius: 7, marginBottom: 2,
                  fontSize: 13, fontWeight: isActive ? 700 : 400,
                  color: isActive ? "#fff" : "#888",
                  background: isActive ? "rgba(232,98,10,0.12)" : "transparent",
                  border: isActive ? "1px solid rgba(232,98,10,0.2)" : "1px solid transparent",
                  cursor: "pointer", textDecoration: "none", fontFamily: "inherit", width: "100%",
                  transition: "all 0.15s",
                };

                if (fullHref) {
                  return (
                    <Link key={item.key} href={fullHref} style={style}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                }
                return (
                  <button key={item.key} onClick={() => navClick(item)} style={style}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Sidebar footer */}
            <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 10, color: "#333" }}>
              Connected Steps Admin
            </div>
          </aside>
        </>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "1.5rem" }}>

          {/* ══ OVERVIEW ════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div style={{ maxWidth: 960, margin: "0 auto" }}>

              {/* Event header card */}
              <div style={{ background: "linear-gradient(135deg, #111 0%, #1a0a00 100%)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" as const }}>
                {event.cover_image ? (
                  <img src={event.cover_image} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 10, background: "rgba(232,98,10,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Image src="/logo.png" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{event.title}</div>
                  <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#666", flexWrap: "wrap" as const }}>
                    {event.start_date && <span>📅 {fmtDate(event.start_date)}{event.start_time ? ` · ${fmtTime(event.start_time)}` : ""}</span>}
                    {event.location  && <span>📍 {event.location}</span>}
                    {event.price > 0 && <span>💰 ₹{event.price}</span>}
                    {event.distance_categories?.length ? <span>🏃 {event.distance_categories.join(", ")}</span> : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                    {badge.label}
                  </span>
                </div>
              </div>

              {/* ── Participants ───────────────────────────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <SectionHeader title="Participants" action={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={load} title="Refresh stats" style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 4 }}>↻</button>
                    <Link href={`/admin/events/${eventId}/registrations`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                      View all →
                    </Link>
                  </div>
                } />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                  <StatCard label="Total"      value={fmt(reg.total)}      />
                  <StatCard label="Confirmed"  value={fmt(reg.confirmed)}  color="#4ade80"  accent />
                  <StatCard label="Paid"       value={fmt(reg.paid)}       color="#4ade80"  />
                  <StatCard label="Free"       value={fmt(reg.free)}       color="#60a5fa"  />
                  <StatCard label="Pending"    value={fmt(reg.pending)}    color="#fbbf24"  accent={reg.pending > 0} />
                  <StatCard label="Checked In" value={fmt(reg.checked_in)} color="#a78bfa"  accent />
                  <StatCard label="Cancelled"  value={fmt(reg.cancelled)}  color={reg.cancelled > 0 ? "#f87171" : "#555"} />
                </div>
              </div>

              {/* ── Capacity ───────────────────────────────────────────────── */}
              {cap.max !== null && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Capacity" />
                  <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <span style={{ fontSize: 28, fontWeight: 800, color: capPct >= 90 ? "#f87171" : "#fff" }}>{fmt(cap.filled)}</span>
                        <span style={{ fontSize: 14, color: "#555", marginLeft: 4 }}>/ {fmt(cap.max!)}</span>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: capPct >= 90 ? "#f87171" : "#4ade80" }}>{capPct}%</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em" }}>filled</div>
                      </div>
                    </div>
                    <ProgressBar value={cap.filled} max={cap.max!} color="#e8620a" />
                    <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
                      <span style={{ color: "#555" }}><span style={{ color: "#4ade80", fontWeight: 700 }}>{fmt(cap.remaining ?? 0)}</span> remaining</span>
                      {capPct >= 90 && <span style={{ color: "#f87171", fontWeight: 600 }}>⚠ Almost full</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Revenue ────────────────────────────────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <SectionHeader title="Revenue" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCard label="Collected"       value={fmtInr(rev.collected)} color="#e8620a" accent />
                  <StatCard label="Pending Payment" value={fmtInr(rev.pending)}   color={rev.pending > 0 ? "#fbbf24" : "#555"} accent={rev.pending > 0} />
                </div>
              </div>

              {/* ── Communication ──────────────────────────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <SectionHeader title="Communication" action={
                  <Link href={`/admin/events/${eventId}/communicate`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                    Open Hub →
                  </Link>
                } />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
                  <StatCard label="Confirmation ✓" value={fmt(emails.confirmation_sent ?? 0)}   color="#4ade80" accent={(emails.confirmation_sent ?? 0) > 0} />
                  <StatCard label="Confirmation ✗" value={fmt(emails.confirmation_failed ?? 0)} color={(emails.confirmation_failed ?? 0) > 0 ? "#f87171" : "#555"} />
                  <StatCard label="Bulk Campaigns"  value={fmt(emails.campaigns ?? 0)} />
                  <StatCard label="Campaign Delivered" value={fmt(emails.campaign_delivered ?? 0)} color="#4ade80" accent={(emails.campaign_delivered ?? 0) > 0} />
                  {(emails.campaign_failed ?? 0) > 0 && <StatCard label="Campaign Failed" value={fmt(emails.campaign_failed ?? 0)} color="#f87171" accent />}
                  {(emails.campaign_queued ?? 0) > 0 && <StatCard label="In Queue" value={fmt(emails.campaign_queued ?? 0)} color="#60a5fa" accent />}
                </div>

                {/* Recent campaigns */}
                {data.recent_comms.length > 0 && (
                  <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
                    {data.recent_comms.slice(0, 3).map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.subject}</div>
                          <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                            {new Date(c.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {" · "}{c.recipients ?? 0} recipients
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, fontSize: 11, flexShrink: 0 }}>
                          <span style={{ color: "#4ade80" }}>✓ {c.sent ?? 0}</span>
                          {(c.failed ?? 0) > 0 && <span style={{ color: "#f87171" }}>✗ {c.failed}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Quick actions ──────────────────────────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <SectionHeader title="Quick Actions" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                  {([
                    { label: "Registrations",       icon: "👥", href: `/admin/events/${eventId}/registrations`,                color: "#e8620a" },
                    { label: "Communicate",         icon: "📢", href: `/admin/events/${eventId}/communicate`,                  color: "#a78bfa" },
                    { label: "Race Day",            icon: "🏃", href: `/admin/events/${eventId}/race-day`,                    color: "#4ade80" },
                    { label: "BIB Collection",      icon: "📦", href: `/admin/events/${eventId}/bib`,                         color: "#60a5fa" },
                    { label: "Results",             icon: "🏅", href: `/admin/events/${eventId}/results`,                     color: "#fbbf24" },
                    { label: "Analytics",           icon: "📈", href: `/admin/events/${eventId}/analytics`,                   color: "#34d399" },
                    { label: "Register Participant",icon: "➕", href: `/admin/events/${eventId}/registrations?action=register`,color: "#e8620a" },
                    { label: "Edit Event",          icon: "✏️", href: `/admin/events/new?edit=${eventId}`,                    color: "#888"    },
                  ] as const).map(a => (
                    <Link key={a.label} href={a.href}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "1.1rem 0.75rem", background: "#111", border: `1px solid ${a.color}18`, borderRadius: 10, textDecoration: "none", transition: "border-color 0.15s" }}>
                      <span style={{ fontSize: 22 }}>{a.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: a.color, textAlign: "center" as const }}>{a.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ RACES ════════════════════════════════════════════════════════ */}
          {activeTab === "races" && (
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              <SectionHeader title={`Races (${races.length})`} action={
                <Link href={`/admin/events/new?edit=${eventId}`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                  + Edit in wizard →
                </Link>
              } />

              {races.length === 0 ? (
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "3rem", textAlign: "center" as const }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#555", marginBottom: 8 }}>No races configured</div>
                  <Link href={`/admin/events/new?edit=${eventId}`} style={{ color: "#e8620a", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                    Add races in the wizard →
                  </Link>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {races.map(r => (
                    <div key={r.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{r.name}</div>
                        <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12, color: "#666" }}>
                          {r.distance     && <span>📏 {r.distance}</span>}
                          {r.report_time  && <span>🕐 Report {r.report_time}</span>}
                          {r.flag_off_time && <span>🏁 Flag off {r.flag_off_time}</span>}
                          {r.gun_time     && <span>🔫 Gun {r.gun_time}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#e8620a" }}>₹{r.price}</span>
                        {r.max_slots && <span style={{ fontSize: 12, color: "#555" }}>{r.max_slots} slots</span>}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: r.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)", color: r.status === "active" ? "#4ade80" : "#555", textTransform: "uppercase" as const }}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Legacy distance_categories */}
              {races.length === 0 && (data.event.distance_categories ?? []).length > 0 && (
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1rem 1.25rem", marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Distance categories (legacy):</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                    {data.event.distance_categories!.map(d => (
                      <span key={d} style={{ padding: "4px 12px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 999, fontSize: 12, color: "#e8620a", fontWeight: 700 }}>{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ FINANCE ════════════════════════════════════════════════════ */}
          {activeTab === "finance" && (
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <SectionHeader title="Finance Summary" action={
                <Link href="/admin/finance" style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                  Finance portal →
                </Link>
              } />

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
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 14px", color: "#4ade80", fontWeight: 600 }}>Paid</td>
                      <td style={{ padding: "10px 14px", color: "#888" }}>{fmt(reg.paid)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#e8620a" }}>{fmtInr(rev.collected)}</td>
                    </tr>
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 14px", color: "#fbbf24", fontWeight: 600 }}>Pending</td>
                      <td style={{ padding: "10px 14px", color: "#888" }}>{fmt(reg.pending)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#fbbf24" }}>{fmtInr(rev.pending)}</td>
                    </tr>
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 14px", color: "#60a5fa", fontWeight: 600 }}>Free / Comp</td>
                      <td style={{ padding: "10px 14px", color: "#888" }}>{fmt(reg.free)}</td>
                      <td style={{ padding: "10px 14px", color: "#555" }}>₹0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ SETTINGS ═══════════════════════════════════════════════════ */}
          {activeTab === "settings" && (
            <div style={{ maxWidth: 540, margin: "0 auto" }}>
              <SectionHeader title="Event Settings" />

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { icon: "✏️",  label: "Edit Event Details",          desc: "Title, date, location, description, media",   href: `/admin/events/new?edit=${eventId}` },
                  { icon: "🏁",  label: "Manage Races",                desc: "Add or edit race categories and pricing",     href: null, action: () => setActiveTab("races") },
                  { icon: "📢",  label: "Communication Hub",           desc: "Send emails, push notifications",             href: `/admin/events/${eventId}/communicate` },
                  { icon: "📈",  label: "Analytics",                   desc: "Registration trends and conversion stats",    href: `/admin/events/${eventId}/analytics` },
                ].map((item, i) => {
                  const inner = (
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc" }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{item.desc}</div>
                      </div>
                      <span style={{ marginLeft: "auto", color: "#555", fontSize: 16 }}>›</span>
                    </div>
                  );

                  const style: React.CSSProperties = { display: "block", padding: "14px 16px", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none", cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "left" as const };

                  if (item.href) return <Link key={i} href={item.href} style={style}>{inner}</Link>;
                  return <button key={i} onClick={item.action ?? undefined} style={style}>{inner}</button>;
                })}

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={duplicateEvent} style={{ width: "100%", padding: "12px 16px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 10, color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                    📋 Duplicate Event — create a copy as new draft
                  </button>
                  <button onClick={archiveEvent} style={{ width: "100%", padding: "12px 16px", background: "rgba(107,114,128,0.06)", border: "1px solid rgba(107,114,128,0.18)", borderRadius: 10, color: "#9ca3af", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                    {event.status === "archived" ? "♻️ Restore Event — move back to draft" : "📦 Archive Event — hide from active list"}
                  </button>
                  <button onClick={togglePublish} style={{ width: "100%", padding: "12px 16px", background: isPublished ? "rgba(239,68,68,0.08)" : "rgba(74,222,128,0.08)", border: `1px solid ${isPublished ? "rgba(239,68,68,0.2)" : "rgba(74,222,128,0.2)"}`, borderRadius: 10, color: isPublished ? "#f87171" : "#4ade80", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                    {isPublished ? "⛔ Unpublish Event" : "🚀 Publish Event"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      <style>{`
        @media (min-width: 768px) {
          aside { position: sticky !important; left: auto !important; transition: none !important; }
        }
        @media (max-width: 767px) {
          .md-hide { display: flex !important; }
        }
        @media (min-width: 768px) {
          .md-hide { display: none !important; }
        }
      `}</style>
    </div>
  );
}
