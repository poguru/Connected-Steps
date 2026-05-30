"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

interface Session {
  id:       string;
  title:    string;
  date:     string;
  location: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

export default function UpcomingSessions() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleJoin(sessionId: string) {
    const { data: { session } } = await getSupabase().auth.getSession();
    if (session) {
      router.push(`/join/${sessionId}`);
    } else {
      router.push(`/auth?redirect=/join/${sessionId}`);
    }
  }

  if (!loading && sessions.length === 0) return null;

  return (
    <section id="upcoming-sessions" className="section" style={{ background: "var(--cs-dark)" }}>
      <div className="container">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "2.5rem" }}>
          <div>
            <span className="gold-line" />
            <div className="section-label">Training Calendar</div>
            <h2 className="font-display mt-2"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 300, color: "var(--cs-cream)" }}>
              Upcoming{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>sessions</em>
            </h2>
          </div>
          <Link href="/auth" style={{ fontSize: "0.82rem", color: "var(--cs-muted)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: "2px", whiteSpace: "nowrap" }}>
            Join to attend →
          </Link>
        </div>

        {/* Cards */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "1rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "10px", padding: "1.5rem", opacity: 0.4, height: "140px", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "1rem" }}>
            {sessions.map((s, i) => {
              const countdown = daysUntil(s.date);
              const isToday   = countdown === "Today";
              const isTomorrow = countdown === "Tomorrow";
              const isUrgent  = isToday || isTomorrow;
              return (
                <div key={s.id}
                  onClick={() => handleJoin(s.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin(s.id)}
                  style={{
                    background: "var(--cs-charcoal)",
                    border: `1px solid ${isUrgent ? "rgba(232,98,10,0.35)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: "10px",
                    padding: "1.5rem",
                    position: "relative",
                    overflow: "hidden",
                    transition: "border-color 0.2s, transform 0.2s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.45)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = isUrgent ? "rgba(232,98,10,0.35)" : "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
                >
                  {/* Countdown badge */}
                  <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
                      padding: "3px 10px", borderRadius: "20px",
                      background: isUrgent ? "var(--cs-orange)" : "rgba(255,255,255,0.07)",
                      color: isUrgent ? "#fff" : "var(--cs-muted)",
                    }}>
                      {countdown}
                    </span>
                  </div>

                  {/* Number */}
                  <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "0.75rem", fontWeight: 600 }}>
                    SESSION {String(i + 1).padStart(2, "0")}
                  </div>

                  {/* Title */}
                  <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.75rem", lineHeight: 1.3 }}>
                    {s.title}
                  </div>

                  {/* Date & location */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--cs-muted)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {formatDate(s.date)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--cs-muted)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      {s.location}
                    </div>
                  </div>

                  {/* Join CTA */}
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--cs-orange)", letterSpacing: "0.04em" }}>
                    Join session →
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </section>
  );
}
