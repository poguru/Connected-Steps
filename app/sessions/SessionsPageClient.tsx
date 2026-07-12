"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Calendar, MapPin, Users, ArrowRight, Clock } from "lucide-react";

interface Session {
  id:               string;
  title:            string;
  date:             string;
  time:             string | null;
  venue:            string | null;
  location:         string;
  photo_url:        string | null;
  difficulty:       string | null;
  registered_count: number;
}

// ── Countdown ──────────────────────────────────────────────────────────────────

interface Cd { label: string; color: string; bg: string; isLive: boolean; }

function countdown(dateStr: string, timeStr: string | null, now: Date): Cd {
  const target  = new Date(`${dateStr}T${timeStr ?? "00:00"}:00+05:30`);
  const diffMs  = target.getTime() - now.getTime();
  const diffMin = diffMs / 60000;

  if (diffMin <= 0 && diffMin > -120)
    return { label: "Live Now",      color: "#4ade80", bg: "rgba(34,197,94,0.22)",  isLive: true  };
  if (diffMin <= 15)
    return { label: "Starting Soon", color: "#ef4444", bg: "rgba(239,68,68,0.22)", isLive: false };
  if (diffMin <= 60)
    return { label: `In ${Math.ceil(diffMin)}m`, color: "#ef4444", bg: "rgba(239,68,68,0.2)", isLive: false };

  const diffH = diffMs / 3600000;
  if (diffH <= 24) {
    const h = Math.floor(diffH), m = Math.floor(diffMin % 60);
    return { label: m > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${h}h`, color: "#e8620a", bg: "rgba(232,98,10,0.2)", isLive: false };
  }
  const days = Math.floor(diffH / 24), hours = Math.floor(diffH % 24);
  return { label: hours > 0 ? `Starts in ${days}d ${hours}h` : `Starts in ${days}d`, color: "#3b82f6", bg: "rgba(59,130,246,0.2)", isLive: false };
}

// ── Difficulty config ──────────────────────────────────────────────────────────

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  beginner:     { label: "⭐ Beginner",     color: "#4ade80", bg: "rgba(74,222,128,0.15)"  },
  intermediate: { label: "🔥 Intermediate", color: "#fb923c", bg: "rgba(251,146,60,0.15)"  },
  advanced:     { label: "💪 Advanced",     color: "#f43f5e", bg: "rgba(244,63,94,0.15)"   },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [now,      setNow]      = useState(() => new Date());

  useEffect(() => {
    fetch("/api/sessions")
      .then(r => r.json())
      .then(d => setSessions(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Tick every minute for countdown updates
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  function join(id: string) {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    router.push(user ? `/join/${id}` : `/auth?redirect=/join/${id}`);
  }

  return (
    <>
      <Navbar />
      <main style={{ minHeight: "100vh", background: "var(--background)", paddingBottom: "4rem" }}>

        {/* Header */}
        <div style={{ padding: "3rem 0 2rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="container">
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--cs-orange)", marginBottom: 8 }}>
              Connected Steps
            </div>
            <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
              Upcoming Sessions
            </h1>
            <p style={{ marginTop: 8, fontSize: "0.9rem", color: "var(--muted-foreground)" }}>
              All scheduled training sessions — pick one and register free.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="container" style={{ paddingTop: "2rem" }}>
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 20 }}>
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ height: 170, background: "rgba(255,255,255,0.05)", animation: "cs-shimmer 1.4s infinite" }} />
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.06)", width: "70%" }} />
                    <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "50%" }} />
                    <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "60%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "5rem 1rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏃</div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--foreground)", marginBottom: 8 }}>
                No upcoming sessions scheduled
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginBottom: "1.5rem" }}>
                Check back soon — new sessions are added regularly.
              </p>
              <button
                onClick={() => router.push("/")}
                style={{ padding: "10px 24px", borderRadius: 999, background: "var(--cs-orange)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "var(--font-body)", fontSize: "0.875rem" }}
              >
                ← Back to Home
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 20 }}>
              {sessions.map(s => (
                <SessionCard key={s.id} session={s} onJoin={join} now={now} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

// ── Session card ───────────────────────────────────────────────────────────────

function SessionCard({
  session: s, onJoin, now,
}: { session: Session; onJoin: (id: string) => void; now: Date }) {
  const [hovered, setHovered] = useState(false);
  const cd = countdown(s.date, s.time, now);

  return (
    <div
      onClick={() => onJoin(s.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onJoin(s.id)}
      style={{
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${
          cd.isLive ? "rgba(74,222,128,0.3)"  :
          hovered   ? "rgba(232,98,10,0.4)"  :
                      "rgba(255,255,255,0.08)"
        }`,
        background: "rgba(255,255,255,0.02)",
        cursor: "pointer",
        transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
        transform: hovered ? "translateY(-4px)" : "none",
        boxShadow: hovered ? "0 12px 32px rgba(0,0,0,0.4)" : cd.isLive ? "0 0 20px rgba(74,222,128,0.12)" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Badge row ── */}
      <div style={{ padding: "11px 13px 0", display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          padding: "3px 8px", borderRadius: 999,
          background: "rgba(232,98,10,0.22)", color: "#e8620a",
          border: "1px solid rgba(232,98,10,0.44)",
        }}>
          Session
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
          background: cd.isLive ? cd.bg : "rgba(255,255,255,0.08)",
          color: cd.color, border: `1px solid ${cd.color}55`,
          display: "flex", alignItems: "center", gap: 3,
        }}>
          {cd.isLive && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0, animation: "pulse-ring 2s infinite" }} />}
          {cd.label}
        </span>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "9px 13px 13px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: "0.93rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.3 }}>
          {s.title}
        </div>

        {/* Difficulty + Points badges */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {s.difficulty && DIFFICULTY_CONFIG[s.difficulty] && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: DIFFICULTY_CONFIG[s.difficulty].bg,
              color: DIFFICULTY_CONFIG[s.difficulty].color,
              border: `1px solid ${DIFFICULTY_CONFIG[s.difficulty].color}44`,
            }}>
              {DIFFICULTY_CONFIG[s.difficulty].label}
            </span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
            background: "rgba(234,179,8,0.12)", color: "#eab308",
            border: "1px solid rgba(234,179,8,0.25)",
          }}>
            🏆 Earn 5 pts
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
            <Calendar size={10} style={{ flexShrink: 0, color: "var(--cs-orange)" }} />
            <span>{fmtDate(s.date)}{s.time ? ` · ${fmtTime(s.time)}` : ""}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
            <MapPin size={10} style={{ flexShrink: 0, color: "var(--cs-orange)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.venue ?? s.location}
            </span>
          </div>
          {s.registered_count > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
              <Users size={10} style={{ flexShrink: 0 }} />
              <span>{s.registered_count} joined this week</span>
            </div>
          )}
          {cd.isLive && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.7rem", color: "#4ade80", fontWeight: 600 }}>
              <Clock size={9} style={{ flexShrink: 0 }} />
              <span>Session is live — head to the venue!</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "auto", paddingTop: 9, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span style={{
            fontSize: "0.75rem", fontWeight: 700,
            color: hovered ? "var(--cs-orange)" : "rgba(255,255,255,0.7)",
            display: "flex", alignItems: "center", gap: 4,
            transition: "color 0.15s",
          }}>
            Register free <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </div>
  );
}
