"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface EventSummary {
  id:                string;
  title:             string;
  start_date:        string;
  location:          string;
  status:            string;
  max_participants:  number | null;
  participant_count: number | null;
  price:             number;
  registration_closes_at: string | null;
}

interface RegStats {
  event_id: string;
  total:    number;
  paid:     number;
  free:     number;
  pending:  number;
  revenue:  number;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(ev: EventSummary) {
  const now     = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const nowISO  = now.toISOString();
  const regClosed = ev.registration_closes_at && nowISO >= ev.registration_closes_at;
  const full      = ev.max_participants != null && (ev.participant_count ?? 0) >= ev.max_participants;

  if (ev.status !== "published") return { label: "Draft",   color: "#666" };
  if (full)                       return { label: "Sold Out", color: "#ef4444" };
  if (regClosed)                  return { label: "Reg. Closed", color: "#eab308" };
  return                                 { label: "Open",    color: "#4ade80" };
}

export default function AdminEventRegistrationsIndex() {
  const [events,  setEvents]  = useState<EventSummary[]>([]);
  const [stats,   setStats]   = useState<Record<string, RegStats>>({});
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/events").then(r => r.json()),
      fetch("/api/admin/events/registrations/summary").then(r => r.json()).catch(() => ({ summaries: [] })),
    ])
      .then(([evData, sumData]) => {
        setEvents(evData.data ?? []);
        const map: Record<string, RegStats> = {};
        for (const s of sumData.summaries ?? []) map[s.event_id] = s;
        setStats(map);
      })
      .catch(() => setError("Failed to load events."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/admin" style={{ textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ fontWeight: 600 }}>Admin</span>
        <span style={{ color: "#444" }}>/</span>
        <Link href="/admin/events" style={{ color: "#888", textDecoration: "none", fontSize: "0.85rem" }}>Events</Link>
        <span style={{ color: "#444" }}>/</span>
        <span style={{ color: "#888", fontSize: "0.85rem" }}>Registrations</span>
      </header>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", marginBottom: "1.5rem" }}>
          Event Registrations
        </h1>

        {loading && <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>Loading events…</div>}
        {error   && <div style={{ color: "#f87171", padding: "1rem" }}>{error}</div>}

        {!loading && events.length === 0 && (
          <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>No events found.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {events.map(ev => {
            const s      = stats[ev.id];
            const badge  = statusBadge(ev);
            const left   = ev.max_participants != null ? ev.max_participants - (ev.participant_count ?? 0) : null;

            return (
              <div key={ev.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{ev.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: `${badge.color}18`, border: `1px solid ${badge.color}30`, padding: "1px 8px", borderRadius: 999 }}>
                        {badge.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                      📅 {fmtDate(ev.start_date)} &nbsp;·&nbsp; 📍 {ev.location}
                    </div>
                    {ev.max_participants != null && (
                      <div style={{ fontSize: 12, color: "#555" }}>
                        {ev.participant_count ?? 0} registered · {left ?? "∞"} available · {ev.max_participants} capacity
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  {s ? (
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{s.total}</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Total</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80" }}>{s.paid}</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Paid</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#60a5fa" }}>{s.free}</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Free</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#eab308" }}>{s.pending}</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Pending</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#e8620a" }}>₹{s.revenue.toLocaleString("en-IN")}</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Revenue</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#555" }}>No registrations yet</div>
                  )}

                  <Link href={`/admin/events/${ev.id}/registrations`}
                    style={{ display: "inline-block", padding: "8px 20px", background: "#e8620a", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
                    View Registrations →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
