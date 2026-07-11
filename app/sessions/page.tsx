"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Calendar, MapPin, ArrowRight } from "lucide-react";

interface Session {
  id:        string;
  title:     string;
  date:      string;
  time:      string | null;
  venue:     string | null;
  location:  string;
  photo_url: string | null;
}

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

const GRADIENT = "linear-gradient(135deg, #0d1b2a 0%, #1a2744 50%, #0f3460 100%)";

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then(r => r.json())
      .then(d => setSessions(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ height: 160, background: "rgba(255,255,255,0.05)", animation: "cs-shimmer 1.4s infinite" }} />
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.06)", width: "70%" }} />
                    <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "50%" }} />
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
              {sessions.map(s => (
                <SessionCard key={s.id} session={s} onJoin={join} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function SessionCard({ session: s, onJoin }: { session: Session; onJoin: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onJoin(s.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onJoin(s.id)}
      style={{
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${hovered ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.08)"}`,
        background: "rgba(255,255,255,0.02)",
        cursor: "pointer",
        transition: "transform 0.2s, border-color 0.2s, box-shadow 0.2s",
        transform: hovered ? "translateY(-4px)" : "none",
        boxShadow: hovered ? "0 12px 32px rgba(0,0,0,0.4)" : "none",
      }}
    >
      {/* Image */}
      <div style={{ position: "relative", height: 160, background: GRADIENT, overflow: "hidden" }}>
        {s.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.photo_url}
            alt={s.title}
            loading="lazy"
            style={{
              width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%",
              display: "block",
              transition: "transform 0.5s",
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
          />
        )}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)",
        }} />
        <span style={{
          position: "absolute", top: 9, left: 9,
          fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          padding: "3px 8px", borderRadius: 999,
          background: "rgba(232,98,10,0.22)", color: "#e8620a",
          backdropFilter: "blur(8px)", border: "1px solid rgba(232,98,10,0.4)",
        }}>
          Session
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.3 }}>
          {s.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          <Calendar size={11} style={{ flexShrink: 0, color: "var(--cs-orange)" }} />
          <span>{fmtDate(s.date)}{s.time ? ` · ${fmtTime(s.time)}` : ""}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          <MapPin size={11} style={{ flexShrink: 0, color: "var(--cs-orange)" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.venue ?? s.location}
          </span>
        </div>
        <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
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
