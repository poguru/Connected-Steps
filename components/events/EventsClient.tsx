"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MyEventRegistrations from "@/components/dashboard/MyEventRegistrations";
import { getEventLifecycleStatus, LIFECYCLE_LABEL, LIFECYCLE_COLOR } from "@/lib/event-status";
import { getDistanceOption } from "@/lib/event-distances";

interface Event {
  id: string; title: string; description: string | null;
  event_type: string; cover_image: string | null;
  start_date: string; start_time: string | null;
  end_date: string | null; end_time: string | null;
  registration_closes_at: string | null;
  distance_categories:    string[] | null;
  location: string; price: number; featured: boolean;
  max_participants: number | null; share_slug: string | null;
}

const TYPE: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  running:   { label: "Running",   icon: "🏃", color: "#e8620a", bg: "#e8620a18" },
  cycling:   { label: "Cycling",   icon: "🚴", color: "#3b82f6", bg: "#3b82f618" },
  training:  { label: "Training",  icon: "💪", color: "#a855f7", bg: "#a855f718" },
  race:      { label: "Race",      icon: "🏆", color: "#ef4444", bg: "#ef444418" },
  community: { label: "Community", icon: "🤝", color: "#22c55e", bg: "#22c55e18" },
  workshop:  { label: "Workshop",  icon: "📚", color: "#eab308", bg: "#eab30818" },
};
const t = (k: string) => TYPE[k] ?? TYPE.running;

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(s: string | null) {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

type Tab = "upcoming" | "past" | "mine";

function EventCard({ ev }: { ev: Event }) {
  const conf = t(ev.event_type);
  const ls   = getEventLifecycleStatus(ev);
  const lsCol = LIFECYCLE_COLOR[ls];

  return (
    <Link href={`/events/${ev.share_slug ?? ev.id}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)",
          background: "var(--surface)", overflow: "hidden",
          display: "flex", transition: "border-color 0.2s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.3)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)"; }}>
        <div style={{ width: 90, flexShrink: 0, position: "relative", overflow: "hidden" }}>
          {ev.cover_image ? (
            <img src={ev.cover_image} alt={ev.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", minHeight: 88, background: `radial-gradient(ellipse at 50% 50%, ${conf.bg.replace("18","30")} 0%, transparent 80%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem" }}>
              {conf.icon}
            </div>
          )}
        </div>
        <div style={{ flex: 1, padding: "0.875rem", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: conf.color, background: conf.bg, border: `1px solid ${conf.color}30`, padding: "1px 7px", borderRadius: 999 }}>
              {conf.label.toUpperCase()}
            </span>
            {ev.price === 0 && (
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#4ade80", background: "#4ade8015", border: "1px solid #4ade8030", padding: "1px 7px", borderRadius: 999 }}>
                FREE
              </span>
            )}
            {/* Lifecycle badge — only show non-UPCOMING states */}
            {ls !== "UPCOMING" && (
              <span style={{ fontSize: "10px", fontWeight: 700, color: lsCol.text, background: lsCol.bg, border: `1px solid ${lsCol.border}`, padding: "1px 7px", borderRadius: 999 }}>
                {LIFECYCLE_LABEL[ls].toUpperCase()}
              </span>
            )}
            {/* Distance badges */}
            {(ev.distance_categories ?? []).map(cat => {
              const d = getDistanceOption(cat);
              return (
                <span key={cat} style={{ fontSize: "10px", fontWeight: 700, color: d.color, background: d.bg, border: `1px solid ${d.border}`, padding: "1px 7px", borderRadius: 999 }}>
                  {cat}
                </span>
              );
            })}
          </div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
          <div style={{ fontSize: "0.73rem", color: "var(--muted-foreground)" }}>📅 {fmtDate(ev.start_date)}{ev.start_time ? ` · ${fmtTime(ev.start_time)}` : ""}</div>
          <div style={{ fontSize: "0.73rem", color: "var(--muted-foreground)" }}>📍 {ev.location}</div>
          {ev.price > 0 && <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--cs-orange)", marginTop: "auto", paddingTop: 4 }}>₹{ev.price}</div>}
        </div>
      </div>
    </Link>
  );
}

export default function EventsClient({ events }: { events: Event[] }) {
  const [tab,       setTab]       = useState<Tab>("upcoming");
  const [pastEvts,  setPastEvts]  = useState<Event[]>([]);
  const [pastLoad,  setPastLoad]  = useState(false);
  const [pastErr,   setPastErr]   = useState("");

  useEffect(() => {
    if (tab !== "past" || pastEvts.length > 0) return;
    setPastLoad(true); setPastErr("");
    fetch("/api/events/past")
      .then(r => r.json())
      .then(d => setPastEvts(d.events ?? []))
      .catch(() => setPastErr("Could not load past events."))
      .finally(() => setPastLoad(false));
  }, [tab]); // eslint-disable-line

  const featured = events.find(e => e.featured) ?? events[0] ?? null;
  const rest     = events.filter(e => e !== featured);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "var(--bg-glass)", backdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "env(safe-area-inset-top) 1.25rem 0",
        minHeight: "calc(56px + env(safe-area-inset-top))",
        height: "calc(56px + env(safe-area-inset-top))",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        paddingBottom: "0.5rem",
      }}>
        <Link href="/dashboard" style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", textDecoration: "none" }}>
          ← Back
        </Link>
        <span style={{ fontSize: "0.875rem", fontWeight: 700 }}>Events</span>
        <div style={{ width: 40 }} />
      </header>

      {/* Tabs */}
      <div style={{ padding: "1rem 1.25rem 0", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 4, padding: 3, background: "rgba(255,255,255,0.04)", borderRadius: 10, marginBottom: "1.25rem", width: "fit-content" }}>
          {(["upcoming", "past", "mine"] as Tab[]).map(tp => (
            <button key={tp} onClick={() => setTab(tp)}
              style={{
                padding: "7px 18px", borderRadius: 8, border: "none",
                cursor: "pointer", fontSize: "0.82rem", fontWeight: 700,
                background: tab === tp ? "var(--cs-orange)" : "transparent",
                color: tab === tp ? "#fff" : "var(--muted-foreground)",
                fontFamily: "inherit", transition: "background 0.15s, color 0.15s",
              }}>
              {tp === "upcoming" ? "Upcoming" : tp === "past" ? "Past" : "My Events"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 1.25rem 7rem" }}>

        {tab === "mine" && <MyEventRegistrations />}

        {tab === "past" && (
          pastLoad ? (
            <div style={{ textAlign: "center", padding: "4rem 1rem", color: "var(--muted-foreground)" }}>Loading…</div>
          ) : pastErr ? (
            <div style={{ textAlign: "center", padding: "4rem 1rem", color: "#f87171" }}>{pastErr}</div>
          ) : pastEvts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "5rem 1rem", color: "var(--muted-foreground)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏁</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>No past events yet</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pastEvts.map(ev => <EventCard key={ev.id} ev={ev} />)}
            </div>
          )
        )}

        {tab === "upcoming" && (
          <>
            {events.length === 0 ? (
              <div style={{ textAlign: "center", padding: "5rem 1rem", color: "var(--muted-foreground)" }}>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📅</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>No upcoming events</div>
                <div style={{ fontSize: "0.875rem" }}>Check back soon — new events are announced regularly.</div>
              </div>
            ) : (
              <>
                {/* Featured hero card */}
                {featured && (
                  <Link href={`/events/${featured.share_slug ?? featured.id}`} style={{ textDecoration: "none", display: "block", marginBottom: "1rem" }}>
                    <div style={{ borderRadius: 18, overflow: "hidden", position: "relative", border: "1px solid rgba(232,98,10,0.25)" }}>
                      <div style={{ position: "relative", height: "clamp(190px, 42vw, 320px)" }}>
                        {featured.cover_image ? (
                          <img src={featured.cover_image} alt={featured.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: `radial-gradient(ellipse at 30% 50%, ${t(featured.event_type).bg.replace("18","35")} 0%, transparent 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "4rem" }}>
                            {t(featured.event_type).icon}
                          </div>
                        )}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)" }} />
                        {featured.featured && (
                          <div style={{ position: "absolute", top: 12, left: 12, fontSize: "10px", fontWeight: 700, color: "#e8620a", background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.35)", padding: "3px 10px", borderRadius: 999, letterSpacing: "0.06em" }}>FEATURED</div>
                        )}
                        {(() => {
                          const ls = getEventLifecycleStatus(featured);
                          const lsCol = LIFECYCLE_COLOR[ls];
                          return ls !== "UPCOMING" ? (
                            <div style={{ position: "absolute", top: 12, right: 12, fontSize: "10px", fontWeight: 700, color: lsCol.text, background: lsCol.bg, border: `1px solid ${lsCol.border}`, padding: "3px 10px", borderRadius: 999 }}>
                              {LIFECYCLE_LABEL[ls].toUpperCase()}
                            </div>
                          ) : null;
                        })()}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "1.25rem" }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: t(featured.event_type).color, background: t(featured.event_type).bg, border: `1px solid ${t(featured.event_type).color}30`, padding: "2px 8px", borderRadius: 999 }}>
                              {t(featured.event_type).icon} {t(featured.event_type).label.toUpperCase()}
                            </span>
                            {(featured.distance_categories ?? []).map(cat => {
                              const d = getDistanceOption(cat);
                              return (
                                <span key={cat} style={{ fontSize: "10px", fontWeight: 700, color: d.color, background: d.bg, border: `1px solid ${d.border}`, padding: "2px 8px", borderRadius: 999 }}>
                                  {cat}
                                </span>
                              );
                            })}
                          </div>
                          <h2 style={{ fontSize: "clamp(1.2rem, 4vw, 1.75rem)", fontWeight: 800, color: "#fff", margin: "0 0 6px", lineHeight: 1.15 }}>{featured.title}</h2>
                          <div style={{ display: "flex", gap: "0.875rem", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.7)" }}>📅 {fmtDate(featured.start_date)}{featured.start_time ? ` · ${fmtTime(featured.start_time)}` : ""}</span>
                            <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.7)" }}>📍 {featured.location}</span>
                            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: featured.price === 0 ? "#4ade80" : "#fff" }}>{featured.price === 0 ? "Free" : `₹${featured.price}`}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}

                {/* Remaining events */}
                {rest.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {rest.map(ev => <EventCard key={ev.id} ev={ev} />)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
