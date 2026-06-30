"use client";

import { useEffect, useState, useRef } from "react";
import { COACHES, CoachProfile } from "@/lib/coach-data";
import { Chip, Button, Label, Card, color } from "@/components/ui/ds";

interface Rating { coach_name: string; avg: number; count: number; }

const BADGES: Record<string, string[]> = {
  "Ashokan K":            ["25+ Yrs Experience", "NIS Certified",   "National Gold Medallist"],
  "Durga Rao Vana":       ["4+ Yrs Coaching",    "NIS Certified",   "National Games Athlete"],
  "Achyuta Kumari Kolli": ["17 National Medals",  "PG Diploma S&C",  "National Medallist"],
};

function Stars({ val }: { val: number }) {
  const full = Math.round(val);
  return (
    <span style={{ color: "#fbbf24", fontSize: "0.82rem", letterSpacing: 1 }}>
      {"★".repeat(full)}{"☆".repeat(Math.max(0, 5 - full))}
    </span>
  );
}

// SectionLabel → DS Label (same orange, uppercase, letter-spacing)
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Label style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>{children}</Label>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function CoachModal({
  coach, rating, onClose, isMobile,
}: {
  coach: CoachProfile; rating?: Rating; onClose: () => void; isMobile: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : "1rem",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? "100%" : "min(860px, 96vw)",
          maxHeight: isMobile ? "92vh" : "90vh",
          height: isMobile ? "92vh" : undefined,
          background: "var(--cs-black)",
          borderRadius: isMobile ? "20px 20px 0 0" : 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: isMobile ? "csSlideUp 0.35s cubic-bezier(0.32,0.72,0,1)" : "csFadeScale 0.25s ease",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Hero */}
        <div style={{ position: "relative", flexShrink: 0, height: isMobile ? 210 : 270, overflow: "hidden" }}>
          {coach.photo ? (
            <img
              src={coach.photo} alt={coach.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "rgba(232,98,10,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>
                {coach.initials}
              </div>
            </div>
          )}
          {/* Gradient overlay */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, var(--cs-black) 100%)" }} />

          {/* Name / role overlay */}
          <div style={{ position: "absolute", bottom: 20, left: 24, right: 56 }}>
            <div style={{ fontSize: 10, color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5, fontWeight: 600 }}>
              {coach.role}
            </div>
            <div style={{ fontSize: isMobile ? "1.4rem" : "1.9rem", fontWeight: 700, color: "#fff", lineHeight: 1.15, marginBottom: 6 }}>
              {coach.name}
            </div>
            {rating && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Stars val={rating.avg} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                  {rating.avg} · {rating.count} {rating.count === 1 ? "review" : "reviews"}
                </span>
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 14, right: 14,
              width: 36, height: 36, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(6px)",
              color: "#fff", cursor: "pointer",
              fontSize: "1.2rem", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 10,
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          className="cs-modal-scroll"
          style={{ overflowY: "auto", flex: 1, padding: isMobile ? "22px 20px 48px" : "30px 36px 44px" }}
        >
          {/* About */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>About</SectionLabel>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.68)", lineHeight: 1.85, margin: 0 }}>
              {coach.bio}
            </p>
            {coach.instagram && (
              <div style={{ marginTop: 10, fontSize: "0.78rem", color: "var(--cs-orange)" }}>
                Instagram: {coach.instagram}
              </div>
            )}
          </section>

          {/* Qualifications — timeline */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>Qualifications</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {coach.qualifications.map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.35)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem",
                    }}>
                      {q.icon}
                    </div>
                    {i < coach.qualifications.length - 1 && (
                      <div style={{ width: 1, height: 18, background: "rgba(232,98,10,0.18)", margin: "3px 0" }} />
                    )}
                  </div>
                  <p style={{ paddingTop: 6, fontSize: "0.83rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.6, margin: 0 }}>
                    {q.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Experience */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>Experience</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {coach.certifications.map((c, i) => (
                <div key={i} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                }}>
                  <span style={{ color: "var(--cs-orange)", flexShrink: 0, marginTop: 1, fontSize: "0.9rem" }}>›</span>
                  <span style={{ fontSize: "0.83rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>{c}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Achievements */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>Achievements</SectionLabel>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))",
              gap: 10,
            }}>
              {coach.medals.map((m, i) => (
                <Card key={i} variant="orange" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: "1.15rem", flexShrink: 0 }}>{m.icon}</span>
                  <span style={{ fontSize: "0.81rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>{m.text}</span>
                </Card>
              ))}
            </div>
          </section>

          {/* Testimonials */}
          {coach.testimonials?.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <SectionLabel>What Athletes Say</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {coach.testimonials.map((t, i) => (
                  <div key={i} style={{
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderLeft: "3px solid rgba(232,98,10,0.5)",
                    borderRadius: "0 8px 8px 0",
                  }}>
                    <p style={{ margin: "0 0 9px", fontSize: "0.84rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.75, fontStyle: "italic" }}>
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div style={{ fontSize: "0.76rem", color: "var(--cs-orange)", fontWeight: 600 }}>
                      {t.name}{" "}
                      <span style={{ color: "rgba(255,255,255,0.38)", fontWeight: 400 }}>· {t.goal}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTAs */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              href="https://wa.me/9703620570"
              target="_blank" rel="noreferrer"
              style={{
                flex: 1, minWidth: 140,
                padding: "13px 20px", borderRadius: 8,
                background: "var(--cs-orange)", color: "#fff",
                textAlign: "center", textDecoration: "none",
                fontWeight: 700, fontSize: "0.875rem", fontFamily: "var(--font-body)",
              }}
            >
              Contact Coach
            </a>
            <a
              href="/membership"
              style={{
                flex: 1, minWidth: 140,
                padding: "13px 20px", borderRadius: 8,
                background: "transparent", color: "var(--cs-orange)",
                border: "1px solid rgba(232,98,10,0.45)",
                textAlign: "center", textDecoration: "none",
                fontWeight: 700, fontSize: "0.875rem", fontFamily: "var(--font-body)",
              }}
            >
              Join Training Program
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function CoachCard({
  coach, rating, isMobile, onOpen,
}: {
  coach: CoachProfile; rating?: Rating; isMobile: boolean; onOpen: () => void;
}) {
  const badges = BADGES[coach.name] ?? [];

  return (
    <div
      className="cs-coach-card"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        overflow: "hidden",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        height: isMobile ? undefined : 300,
        maxHeight: isMobile ? 380 : 300,
      }}
    >
      {/* Photo */}
      <div style={{
        flexShrink: 0,
        width: isMobile ? "100%" : 150,
        height: isMobile ? 175 : "100%",
        overflow: "hidden",
        position: "relative",
      }}>
        {coach.photo ? (
          <img
            src={coach.photo}
            alt={coach.name}
            className="cs-coach-img"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: "rgba(232,98,10,0.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "var(--cs-orange)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.2rem", fontWeight: 700, color: "#fff",
            }}>
              {coach.initials}
            </div>
          </div>
        )}
        {/* Subtle gradient on right edge (desktop) / bottom edge (mobile) */}
        {!isMobile && (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 60%, rgba(11,14,21,0.6) 100%)" }} />
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, minWidth: 0,
        padding: isMobile ? "14px 16px 16px" : "18px 18px 18px 16px",
        display: "flex", flexDirection: "column", gap: 7,
        overflow: "hidden",
      }}>
        {/* Role */}
        <div style={{ fontSize: 10, color: "var(--cs-orange)", letterSpacing: "0.11em", textTransform: "uppercase", fontWeight: 600 }}>
          {coach.role}
        </div>

        {/* Name */}
        <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>
          {coach.name}
        </div>

        {/* Rating */}
        {rating ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Stars val={rating.avg} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{rating.avg}</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 2 }}>
            {"★★★★★".split("").map((s, i) => (
              <span key={i} style={{ color: "rgba(251,191,36,0.3)", fontSize: "0.78rem" }}>{s}</span>
            ))}
          </div>
        )}

        {/* Bio — 2 lines max */}
        <p style={{
          fontSize: "0.78rem",
          color: "rgba(255,255,255,0.55)",
          lineHeight: 1.65,
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}>
          {coach.bio}
        </p>

        {/* Badges */}
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
          {badges.map(b => <Chip key={b} label={b} size="xs" color={color.orange} />)}
        </div>

        {/* Know More */}
        <div style={{ marginTop: "auto", paddingTop: 4 }}>
          <Button variant="outline" size="sm" onClick={onOpen}>Know More →</Button>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function Coaches() {
  const [ratings,     setRatings]     = useState<Rating[]>([]);
  const [activeCoach, setActiveCoach] = useState<CoachProfile | null>(null);
  const [isMobile,    setIsMobile]    = useState(false);

  useEffect(() => {
    fetch("/api/coach-rating")
      .then(r => r.json())
      .then(d => { if (d.ratings) setRatings(d.ratings); })
      .catch(() => {});

    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <section id="coaches" className="section" style={{ background: "var(--cs-black)" }}>

      {/* Scoped styles */}
      <style>{`
        @keyframes csSlideUp  { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes csFadeScale { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        .cs-coach-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .cs-coach-card:hover { transform: translateY(-5px); box-shadow: 0 22px 60px rgba(232,98,10,0.14), 0 4px 16px rgba(0,0,0,0.4); }
        .cs-coach-card:hover .cs-coach-img { transform: scale(1.07); }
        .cs-coach-img { transition: transform 0.5s ease; }

        .cs-know-more-btn { transition: background 0.2s, box-shadow 0.2s; }
        .cs-know-more-btn:hover { background: rgba(232,98,10,0.16) !important; box-shadow: 0 0 0 1px rgba(232,98,10,0.45); }

        .cs-modal-scroll::-webkit-scrollbar { width: 4px; }
        .cs-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .cs-modal-scroll::-webkit-scrollbar-thumb { background: rgba(232,98,10,0.28); border-radius: 2px; }
      `}</style>

      <div className="container">

        {/* Header */}
        <div className="text-center mb-16">
          <span className="gold-line mx-auto" />
          <div className="section-label">Meet the coaches</div>
          <h2
            className="font-display mt-2"
            style={{ fontSize: "clamp(2.2rem, 4vw, 3.5rem)", fontWeight: 300, color: "var(--cs-white)" }}
          >
            Trained by champions.
            <br />
            <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Coached by the best.</em>
          </h2>
          <p style={{ marginTop: "1rem", fontSize: "0.95rem", color: "var(--cs-muted)", maxWidth: "520px", margin: "1rem auto 0" }}>
            Our coaches are national-level athletes and certified professionals who&apos;ve competed and won at the highest levels.
          </p>
        </div>

        {/* Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 16 : 20,
        }}>
          {COACHES.map(coach => (
            <CoachCard
              key={coach.slug}
              coach={coach}
              rating={ratings.find(r => r.coach_name === coach.name)}
              isMobile={isMobile}
              onOpen={() => setActiveCoach(coach)}
            />
          ))}
        </div>

      </div>

      {/* Modal / drawer */}
      {activeCoach && (
        <CoachModal
          coach={activeCoach}
          rating={ratings.find(r => r.coach_name === activeCoach.name)}
          onClose={() => setActiveCoach(null)}
          isMobile={isMobile}
        />
      )}
    </section>
  );
}
