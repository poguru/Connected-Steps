"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { COACHES, CoachProfile } from "@/lib/coach-data";

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

function ModalLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 20, height: 1, background: "rgba(232,98,10,0.7)", flexShrink: 0 }} />
      <span style={{ fontSize: 10, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--cs-orange)", fontWeight: 700 }}>
        {children}
      </span>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function CoachModal({ coach, rating, onClose, isMobile }: {
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
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center", padding: isMobile ? 0 : "1rem",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: isMobile ? "100%" : "min(860px, 96vw)",
        maxHeight: isMobile ? "92vh" : "90vh",
        height: isMobile ? "92vh" : undefined,
        background: "var(--cs-black)", borderRadius: isMobile ? "20px 20px 0 0" : 16,
        overflow: "hidden", display: "flex", flexDirection: "column",
        animation: isMobile ? "csSlideUp 0.35s cubic-bezier(0.32,0.72,0,1)" : "csFadeScale 0.25s ease",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Hero photo */}
        <div style={{ position: "relative", flexShrink: 0, height: isMobile ? 210 : 270, overflow: "hidden" }}>
          {coach.photo ? (
            <img src={coach.photo} alt={coach.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "rgba(232,98,10,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: 700, color: "#fff" }}>
                {coach.initials}
              </div>
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, var(--cs-black) 100%)" }} />
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
          <button onClick={onClose} style={{
            position: "absolute", top: 14, right: 14,
            width: 36, height: 36, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)", color: "#fff", cursor: "pointer",
            fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10,
          }}>×</button>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="cs-modal-scroll"
          style={{ overflowY: "auto", flex: 1, padding: isMobile ? "22px 20px 48px" : "30px 36px 44px" }}>

          <section style={{ marginBottom: 28 }}>
            <ModalLabel>About</ModalLabel>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.68)", lineHeight: 1.85, margin: 0 }}>
              {coach.bio}
            </p>
            {coach.instagram && (
              <div style={{ marginTop: 10, fontSize: "0.78rem", color: "var(--cs-orange)" }}>Instagram: {coach.instagram}</div>
            )}
          </section>

          <section style={{ marginBottom: 28 }}>
            <ModalLabel>Qualifications</ModalLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {coach.qualifications.map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem" }}>
                      {q.icon}
                    </div>
                    {i < coach.qualifications.length - 1 && (
                      <div style={{ width: 1, height: 18, background: "rgba(232,98,10,0.18)", margin: "3px 0" }} />
                    )}
                  </div>
                  <p style={{ paddingTop: 6, fontSize: "0.83rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.6, margin: 0 }}>{q.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 28 }}>
            <ModalLabel>Experience</ModalLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {coach.certifications.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
                  <span style={{ color: "var(--cs-orange)", flexShrink: 0, marginTop: 1, fontSize: "0.9rem" }}>›</span>
                  <span style={{ fontSize: "0.83rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>{c}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 28 }}>
            <ModalLabel>Achievements</ModalLabel>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
              {coach.medals.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.18)", borderRadius: 10 }}>
                  <span style={{ fontSize: "1.15rem", flexShrink: 0 }}>{m.icon}</span>
                  <span style={{ fontSize: "0.81rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>{m.text}</span>
                </div>
              ))}
            </div>
          </section>

          {coach.testimonials?.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <ModalLabel>What Athletes Say</ModalLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {coach.testimonials.map((t, i) => (
                  <div key={i} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: "3px solid rgba(232,98,10,0.5)", borderRadius: "0 8px 8px 0" }}>
                    <p style={{ margin: "0 0 9px", fontSize: "0.84rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.75, fontStyle: "italic" }}>
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div style={{ fontSize: "0.76rem", color: "var(--cs-orange)", fontWeight: 600 }}>
                      {t.name}{" "}<span style={{ color: "rgba(255,255,255,0.38)", fontWeight: 400 }}>· {t.goal}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="https://wa.me/9703620570" target="_blank" rel="noreferrer"
              style={{ flex: 1, minWidth: 140, padding: "13px 20px", borderRadius: 8, background: "var(--cs-orange)", color: "#fff", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: "0.875rem", fontFamily: "var(--font-body)" }}>
              Book Consultation
            </a>
            <a href="/auth?tab=register"
              style={{ flex: 1, minWidth: 140, padding: "13px 20px", borderRadius: 8, background: "transparent", color: "var(--cs-orange)", border: "1px solid rgba(232,98,10,0.45)", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: "0.875rem", fontFamily: "var(--font-body)" }}>
              Join Training Program
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card (vertical) ───────────────────────────────────────────────────────────

function CoachCard({ coach, rating, onOpen }: {
  coach: CoachProfile; rating?: Rating; onOpen: () => void;
}) {
  const badges  = BADGES[coach.name] ?? [];
  const isHead  = coach.slug === "ashokan-k";

  return (
    <div className="cs-cc-card" style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${isHead ? "rgba(232,98,10,0.35)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 14, overflow: "hidden",
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      {/* Photo */}
      <div style={{ position: "relative", height: 200, flexShrink: 0, overflow: "hidden" }}>
        {coach.photo ? (
          <img src={coach.photo} alt={coach.name} className="cs-cc-img"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "rgba(232,98,10,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>
              {coach.initials}
            </div>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(11,14,21,0.75) 100%)" }} />
        {isHead && (
          <div style={{ position: "absolute", top: 10, left: 10, padding: "4px 9px", borderRadius: 4, background: "rgba(232,98,10,0.9)", fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Head Coach
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "16px 16px 18px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ fontSize: 10, color: "var(--cs-orange)", letterSpacing: "0.11em", textTransform: "uppercase", fontWeight: 600 }}>
          {coach.role}
        </div>
        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
          {coach.name}
        </div>

        {rating ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Stars val={rating.avg} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{rating.avg}</span>
          </div>
        ) : (
          <div>{"★★★★★".split("").map((s, i) => (
            <span key={i} style={{ color: "rgba(251,191,36,0.3)", fontSize: "0.78rem" }}>{s}</span>
          ))}</div>
        )}

        {badges[1] && (
          <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 4, background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.22)", width: "fit-content" }}>
            <span style={{ fontSize: "0.65rem", color: "rgba(232,98,10,0.9)", fontWeight: 600 }}>{badges[1]}</span>
          </div>
        )}

        <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.65, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
          {coach.bio}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {badges.map(b => (
            <span key={b} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(232,98,10,0.09)", border: "1px solid rgba(232,98,10,0.28)", color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap", fontWeight: 500 }}>
              {b}
            </span>
          ))}
        </div>

        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          <button onClick={onOpen} className="cs-cc-btn"
            style={{ width: "100%", fontSize: "0.78rem", fontWeight: 700, color: "var(--cs-orange)", background: "rgba(232,98,10,0.07)", border: "1px solid rgba(232,98,10,0.32)", borderRadius: 6, padding: "9px 14px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
            View Profile →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function CoachCarouselSection({
  sectionLabel = "OUR COACHES",
  title = "Meet Our Coaching Team",
  subtitle,
  ctaLabel = "Join Training Program",
  ctaHref = "/auth?tab=register",
}: {
  sectionLabel?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
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
    <>
      <style>{`
        @keyframes csSlideUp   { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes csFadeScale { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        .cs-cc-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .cs-cc-card:hover { transform: translateY(-4px); box-shadow: 0 20px 50px rgba(232,98,10,0.14), 0 4px 16px rgba(0,0,0,0.4); }
        .cs-cc-card:hover .cs-cc-img { transform: scale(1.05); }
        .cs-cc-img { transition: transform 0.5s ease; }

        .cs-cc-btn { transition: background 0.2s, box-shadow 0.2s; }
        .cs-cc-btn:hover { background: rgba(232,98,10,0.15) !important; box-shadow: 0 0 0 1px rgba(232,98,10,0.45); }

        .cs-modal-scroll::-webkit-scrollbar { width: 4px; }
        .cs-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .cs-modal-scroll::-webkit-scrollbar-thumb { background: rgba(232,98,10,0.28); border-radius: 2px; }

        .cs-cc-track { scrollbar-width: none; -ms-overflow-style: none; }
        .cs-cc-track::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "0.5rem" }}>
          {sectionLabel}
        </div>
        <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 700, color: "#fff", margin: "0 0 0.5rem", lineHeight: 1.2 }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.55)", maxWidth: 500, margin: "0 auto" }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Cards — mobile: swipeable carousel / desktop: 3-col grid */}
      {isMobile ? (
        <div className="cs-cc-track" style={{
          display: "flex", gap: 14,
          overflowX: "auto", scrollSnapType: "x mandatory",
          padding: "4px 0 12px",
        }}>
          {COACHES.map(coach => (
            <div key={coach.slug} style={{ scrollSnapAlign: "start", flexShrink: 0, width: "85vw" }}>
              <CoachCard
                coach={coach}
                rating={ratings.find(r => r.coach_name === coach.name)}
                onOpen={() => setActiveCoach(coach)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {COACHES.map(coach => (
            <CoachCard
              key={coach.slug}
              coach={coach}
              rating={ratings.find(r => r.coach_name === coach.name)}
              onOpen={() => setActiveCoach(coach)}
            />
          ))}
        </div>
      )}

      {/* CTA */}
      <div style={{ marginTop: "1.75rem", textAlign: "center" }}>
        <a href={ctaHref}
          style={{ display: "inline-block", padding: "13px 32px", borderRadius: 8, background: "var(--cs-orange)", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem", fontFamily: "var(--font-body)" }}>
          {ctaLabel} →
        </a>
      </div>

      {/* Profile modal */}
      {activeCoach && (
        <CoachModal
          coach={activeCoach}
          rating={ratings.find(r => r.coach_name === activeCoach.name)}
          onClose={() => setActiveCoach(null)}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
