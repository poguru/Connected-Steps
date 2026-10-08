"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  type: string;
  platform: string;
  title: string;
  event_date: string;
  venue?: string;
  city?: string;
  category?: string;
  category_color?: string;
  participant_count?: number;
  payment_status: string;
  registration_status: string;
  registration_code?: string;
  link: string;
  created_at: string;
}

interface EventsResponse {
  events: Event[];
  summary: {
    total: number;
    it_run: number;
    other_events: number;
    upcoming: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const BG = "#080808";
const ACCENT = "#e8620a";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function paymentBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "paid":    return { label: "Paid",    color: "#10b981", bg: "rgba(16,185,129,0.1)" };
    case "free":    return { label: "Free",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)" };
    case "pending": return { label: "Pending", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
    default:        return { label: "Failed",  color: "#f87171", bg: "rgba(248,113,113,0.1)" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MyEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/me/events");
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          setError(err.error ?? "Failed to load events");
          setLoading(false);
          return;
        }
        const d = await res.json() as EventsResponse;
        setEvents(d.events ?? []);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const now = new Date();
  const upcomingEvents = events.filter(e => new Date(e.event_date) > now);
  const pastEvents = events.filter(e => new Date(e.event_date) <= now);

  const displayedEvents =
    filter === "upcoming" ? upcomingEvents :
    filter === "past" ? pastEvents :
    events;

  return (
    <div style={{ background: BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>
      {/* Navigation */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        height: 52, display: "flex", alignItems: "center",
        padding: "0 clamp(1rem,4vw,2rem)", justifyContent: "space-between",
      }}>
        <Link href="/" style={{ color: "#888", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
          ← Connected Steps
        </Link>
        <div style={{ fontSize: 13, fontWeight: 600 }}>My Events</div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "calc(52px + 2rem) clamp(1rem,4vw,2rem) 3rem" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, marginBottom: 8 }}>My Events</h1>
          <p style={{ fontSize: 14, color: "#666", margin: 0, marginBottom: 24 }}>
            All your Connected Steps events and registrations in one place.
          </p>

          {/* Stats */}
          {!loading && events.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: ACCENT }}>{events.length}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Total</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#60a5fa" }}>{upcomingEvents.length}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Upcoming</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#888" }}>{pastEvents.length}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Past</div>
              </div>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.08)", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 12,
            padding: 16,
            color: "#f87171",
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {/* No events */}
        {!loading && !error && events.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No events yet</h2>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
              When you register for events, they'll appear here.
            </p>
            <Link href="/it-run/register" style={{
              display: "inline-block",
              padding: "12px 28px",
              background: ACCENT,
              color: "#fff",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}>
              Register for The IT Run
            </Link>
          </div>
        )}

        {/* Filter tabs */}
        {!loading && !error && events.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 16 }}>
            {[
              { value: "all" as const, label: "All", count: events.length },
              { value: "upcoming" as const, label: "Upcoming", count: upcomingEvents.length },
              { value: "past" as const, label: "Past", count: pastEvents.length },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                style={{
                  background: filter === tab.value ? "rgba(232,98,10,0.2)" : "transparent",
                  border: filter === tab.value ? "1px solid rgba(232,98,10,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  padding: "8px 16px",
                  color: filter === tab.value ? ACCENT : "#888",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        )}

        {/* Event list */}
        {!loading && !error && displayedEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {displayedEvents.map(event => {
              const badge = paymentBadge(event.payment_status);
              const isUpcoming = new Date(event.event_date) > now;

              return (
                <Link
                  key={event.id}
                  href={event.link}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: "20px 24px",
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(232,98,10,0.3)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                        {event.title}
                      </div>
                      {event.category && (
                        <div style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          color: "#888",
                        }}>
                          <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: event.category_color || ACCENT,
                          }} />
                          {event.category}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      {isUpcoming && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 20,
                          color: "#60a5fa",
                          background: "rgba(96,165,250,0.1)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}>
                          Upcoming
                        </span>
                      )}
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: 20,
                        color: badge.color,
                        background: badge.bg,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}>
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, fontSize: 13 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>DATE</div>
                      <div style={{ fontWeight: 600 }}>{formatDate(event.event_date)}</div>
                    </div>
                    {event.venue && (
                      <div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>VENUE</div>
                        <div style={{ fontWeight: 600 }}>{event.venue}{event.city ? `, ${event.city}` : ""}</div>
                      </div>
                    )}
                    {event.participant_count && (
                      <div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>PARTICIPANTS</div>
                        <div style={{ fontWeight: 600 }}>{event.participant_count}</div>
                      </div>
                    )}
                    {event.registration_code && (
                      <div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>CODE</div>
                        <div style={{ fontWeight: 600, fontFamily: "monospace" }}>{event.registration_code}</div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* No events in current filter */}
        {!loading && !error && events.length > 0 && displayedEvents.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {filter === "upcoming" ? "No upcoming events" : "No past events"}
            </h2>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
