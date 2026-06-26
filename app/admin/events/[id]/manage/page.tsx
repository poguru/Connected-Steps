"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Event {
  id:                string;
  title:             string;
  event_category:    string;
  event_type:        string;
  status:            string;
  start_date:        string;
  start_time:        string | null;
  location:          string;
  participant_count: number;
  max_participants:  number | null;
  price:             number;
  featured:          boolean;
  distance_categories: string[];
}

interface Race {
  id:         string;
  name:       string;
  distance:   string;
  price:      number;
  max_slots:  number | null;
  status:     string;
  gun_time:   string | null;
}

interface Stats {
  total:         number;
  paid:          number;
  free:          number;
  pending:       number;
  confirmed:     number;
  checked_in:    number;
  revenue:       number;
  email_sent:    number;
  email_failed:  number;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.5rem" };

const statCard = (color = "#fff"): React.CSSProperties => ({
  background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
  padding: "1.1rem 1.25rem",
});

function StatBox({ label, value, color = "#fff", sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={statCard(color)}>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginTop: 6, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Nav tabs ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",       label: "Overview" },
  { key: "registrations",  label: "Registrations" },
  { key: "races",          label: "Races" },
  { key: "communication",  label: "Communicate" },
  { key: "settings",       label: "Settings" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventManagePage() {
  const params                   = useParams();
  const eventId                  = params.id as string;

  const [tab,    setTab]         = useState("overview");
  const [ev,     setEv]          = useState<Event | null>(null);
  const [races,  setRaces]       = useState<Race[]>([]);
  const [stats,  setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]    = useState(true);
  const [error,  setError]       = useState("");

  useEffect(() => {
    if (!eventId) return;
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [evRes, racesRes, statsRes] = await Promise.all([
        fetch(`/api/admin/events`).then(r => r.json()),
        fetch(`/api/admin/events/${eventId}/races`).then(r => r.json()),
        fetch(`/api/admin/events/registrations?event_id=${eventId}`).then(r => r.json()),
      ]);

      // Find this event in the list
      const found = (evRes.data ?? []).find((e: Event) => e.id === eventId) ?? null;
      setEv(found);
      setRaces(racesRes.races ?? []);

      if (statsRes.summary) {
        const s = statsRes.summary as { total: number; paid: number; free: number; pending: number; revenue: number };
        const regs = (statsRes.registrations ?? []) as { email_status: string | null; checked_in_at: string | null }[];
        setStats({
          total:        s.total,
          paid:         s.paid,
          free:         s.free,
          pending:      s.pending,
          confirmed:    s.paid + s.free,
          checked_in:   regs.filter(r => r.checked_in_at).length,
          revenue:      s.revenue,
          email_sent:   regs.filter(r => r.email_status === "sent").length,
          email_failed: regs.filter(r => r.email_status === "failed").length,
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function togglePublish() {
    if (!ev) return;
    const newStatus = ev.status === "published" ? "draft" : "published";
    await fetch("/api/admin/events", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId, status: newStatus }),
    });
    setEv(e => e ? { ...e, status: newStatus } : e);
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
      Loading…
    </div>
  );

  if (error || !ev) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#f87171", marginBottom: 8 }}>{error || "Event not found"}</div>
        <Link href="/admin/events" style={{ color: "#e8620a", fontSize: 13 }}>← Back to events</Link>
      </div>
    </div>
  );

  const isPublished = ev.status === "published";
  const eventDate   = ev.start_date ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/admin/events" style={{ textDecoration: "none", color: "#555", fontSize: 13 }}>
            ← Events
          </Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{ev.title}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: isPublished ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)", color: isPublished ? "#4ade80" : "#666", textTransform: "uppercase", letterSpacing: ".06em" }}>
            {ev.status}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/registrations`} style={{ padding: "7px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Registrations
          </Link>
          <Link href={`/events`} target="_blank" style={{ padding: "7px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Preview ↗
          </Link>
          <button onClick={togglePublish} style={{ padding: "7px 16px", background: isPublished ? "rgba(239,68,68,0.12)" : "#e8620a", border: "none", borderRadius: 8, color: isPublished ? "#f87171" : "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {isPublished ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      {/* Event Banner */}
      <div style={{ background: "linear-gradient(135deg, #111 0%, #1a0a00 100%)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1.5rem 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "#e8620a22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Image src="/logo.png" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{ev.title}</h1>
            <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 13, color: "#666" }}>
              {eventDate && <span>📅 {eventDate}{ev.start_time ? ` at ${ev.start_time}` : ""}</span>}
              {ev.location && <span>📍 {ev.location}</span>}
              {ev.distance_categories?.length > 0 && <span>🏃 {ev.distance_categories.join(", ")}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link href={`/admin/events/new?edit=${eventId}`} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              Edit Event
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "12px 18px", background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? "#fff" : "#555",
              borderBottom: tab === t.key ? "2px solid #e8620a" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s",
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.75rem 2rem" }}>

        {/* Overview Tab */}
        {tab === "overview" && (
          <div>
            {/* Stats grid */}
            {stats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                <StatBox label="Total"        value={stats.total}                                                   />
                <StatBox label="Confirmed"    value={stats.confirmed}      color="#4ade80"                          />
                <StatBox label="Pending Pay"  value={stats.pending}        color="#fbbf24"                          />
                <StatBox label="Checked In"   value={stats.checked_in}     color="#60a5fa"                          />
                <StatBox label="Revenue"      value={`₹${stats.revenue.toLocaleString("en-IN")}`} color="#e8620a"  />
                <StatBox label="Email Sent"   value={stats.email_sent}     color="#a3e635"                          />
                <StatBox label="Email Failed" value={stats.email_failed}   color={stats.email_failed > 0 ? "#f87171" : "#555"} />
                <StatBox label="Capacity"     value={ev.max_participants ? `${ev.participant_count}/${ev.max_participants}` : ev.participant_count} />
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Registrations",  href: `/admin/events/${eventId}/registrations`, color: "#e8620a" },
                { label: "🏁 Race Day",    href: `/admin/events/${eventId}/race-day`,       color: "#4ade80" },
                { label: "BIB Collection", href: `/admin/events/${eventId}/bib`,            color: "#60a5fa" },
                { label: "📊 Results",     href: `/admin/events/${eventId}/results`,         color: "#fbbf24" },
                { label: "📢 Communicate", href: `/admin/events/${eventId}/communicate`,    color: "#a78bfa" },
                { label: "📈 Analytics",   href: `/admin/events/${eventId}/analytics`,      color: "#34d399" },
              ].map(a => (
                <Link key={a.label} href={a.href} style={{ ...card, textDecoration: "none", display: "block", textAlign: "center", padding: "1.25rem", borderColor: `${a.color}22` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: a.color }}>{a.label}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Registrations tab — links to existing page */}
        {tab === "registrations" && (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Registration Management</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>Full registration list with QR, payment, and email status</div>
            <Link href={`/admin/events/${eventId}/registrations`} style={{ padding: "12px 28px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              Open Registration Manager →
            </Link>
          </div>
        )}

        {/* Races tab */}
        {tab === "races" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: ".07em" }}>
                Races ({races.length})
              </div>
            </div>

            {races.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: "3rem" }}>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>No races configured for this event</div>
                <Link href={`/admin/events/new?edit=${eventId}`} style={{ color: "#e8620a", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  Add races in the wizard →
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {races.map(r => (
                  <div key={r.id} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</span>
                      <span style={{ fontSize: 12, color: "#555", marginLeft: 10 }}>{r.distance}</span>
                    </div>
                    <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#888", alignItems: "center" }}>
                      <span style={{ color: "#e8620a", fontWeight: 700 }}>₹{r.price}</span>
                      {r.max_slots && <span>{r.max_slots} slots</span>}
                      {r.gun_time && <span>Gun: {r.gun_time}</span>}
                      <span style={{ padding: "2px 10px", borderRadius: 999, background: r.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)", color: r.status === "active" ? "#4ade80" : "#555", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const }}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Backward compat: show distance_categories if races table empty */}
            {races.length === 0 && ev.distance_categories?.length > 0 && (
              <div style={{ ...card, marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>Legacy categories (from existing event):</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  {ev.distance_categories.map(d => (
                    <span key={d} style={{ padding: "4px 12px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 999, fontSize: 12, color: "#e8620a", fontWeight: 700 }}>{d}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Communicate tab */}
        {tab === "communication" && (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📢</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Communication</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>Bulk emails, WhatsApp messages, and push notifications</div>
            <Link href={`/admin/events/${eventId}/registrations`} style={{ padding: "12px 28px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              Open Communication Hub →
            </Link>
          </div>
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <div style={{ ...card, maxWidth: 500 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 16 }}>Event Settings</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Link href={`/admin/events/new?edit=${eventId}`} style={{ padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#ccc", fontSize: 13, fontWeight: 600, textDecoration: "none", display: "block" }}>
                ✏️  Edit Event Details
              </Link>
              <button onClick={togglePublish} style={{ padding: "12px 16px", background: isPublished ? "rgba(239,68,68,0.08)" : "rgba(22,163,74,0.08)", border: `1px solid ${isPublished ? "rgba(239,68,68,0.2)" : "rgba(22,163,74,0.2)"}`, borderRadius: 8, color: isPublished ? "#f87171" : "#4ade80", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                {isPublished ? "⛔ Unpublish Event" : "🚀 Publish Event"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
