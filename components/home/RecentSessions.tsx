"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface SessionFeedback { user_name: string; rating: number; comment: string; }
interface RecentSession {
  id: string; title: string; date: string; time: string | null;
  venue: string | null; location: string; photo_url: string | null;
  avgRating: number | null; reviewCount: number; feedback: SessionFeedback[];
}

function Stars({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width="15" height="15" viewBox="0 0 24 24">
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            fill={s <= Math.round(rating) ? "#e8620a" : "rgba(255,255,255,0.15)"}
            stroke={s <= Math.round(rating) ? "#e8620a" : "rgba(255,255,255,0.2)"} strokeWidth="1"
          />
        </svg>
      ))}
    </div>
  );
}

export default function RecentSessions() {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [current,  setCurrent]  = useState(0);
  const [visible,  setVisible]  = useState(true);
  const [paused,   setPaused]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/sessions/recent")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const goTo = useCallback((idx: number) => {
    setVisible(false);
    setTimeout(() => {
      setCurrent(idx);
      setVisible(true);
    }, 320);
  }, []);

  const next = useCallback(() => goTo((current + 1) % sessions.length), [current, sessions.length, goTo]);
  const prev = useCallback(() => goTo((current - 1 + sessions.length) % sessions.length), [current, sessions.length, goTo]);

  useEffect(() => {
    if (paused || sessions.length <= 1) return;
    timerRef.current = setInterval(next, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, sessions.length, next]);

  if (loading || sessions.length === 0) return null;

  const s = sessions[current];
  const dateStr = new Date(s.date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const topReview = s.feedback.find((f) => f.comment);

  return (
    <section id="recent-sessions" className="section" style={{ background: "var(--cs-black)", padding: "5rem 0" }}>
      <div className="container">

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <span className="gold-line mx-auto" />
          <div className="section-label" style={{ marginTop: "0.5rem" }}>Community</div>
          <h2 className="font-display mt-2"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 300, color: "var(--cs-white)" }}>
            Recent{" "}
            <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Sessions</em>
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginTop: "0.5rem" }}>
            See what our community has been up to.
          </p>
        </div>

        {/* Carousel */}
        <div style={{ maxWidth: "860px", margin: "0 auto", position: "relative" }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}>

          {/* Card */}
          <div style={{
            background: "var(--cs-dark)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            overflow: "hidden",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.32s ease, transform 0.32s ease",
          }}>

            {/* Photo */}
            {s.photo_url && (
              <div style={{ position: "relative", width: "100%", height: "clamp(220px, 45vw, 400px)", overflow: "hidden" }}>
                <img
                  src={s.photo_url} alt={s.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
                />
                {/* Gradient overlay at bottom */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%",
                  background: "linear-gradient(to top, rgba(13,37,64,0.95), transparent)" }} />

                {/* Session counter badge */}
                <div style={{ position: "absolute", top: "1rem", right: "1rem",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: "20px",
                  padding: "4px 12px", fontSize: "11px", color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>
                  {current + 1} / {sessions.length}
                </div>

                {/* Title overlaid on photo */}
                <div style={{ position: "absolute", bottom: "1.25rem", left: "1.5rem", right: "1.5rem" }}>
                  <div style={{ fontSize: "clamp(1.1rem, 3vw, 1.5rem)", fontWeight: 700, color: "#fff",
                    fontFamily: "var(--font-display)", lineHeight: 1.2 }}>{s.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", marginTop: "4px" }}>
                    📅 {dateStr}{s.time ? ` · ${s.time}` : ""}
                  </div>
                </div>
              </div>
            )}

            {/* Info strip */}
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start", justifyContent: "space-between" }}>

              {/* Location + rating */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)" }}>
                  📍 {s.venue || s.location}
                </div>
                {s.avgRating !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Stars rating={s.avgRating} />
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.avgRating.toFixed(1)}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--cs-muted)" }}>({s.reviewCount} review{s.reviewCount !== 1 ? "s" : ""})</span>
                  </div>
                )}
              </div>

              {/* Top review quote */}
              {topReview && (
                <div style={{
                  flex: "1 1 240px",
                  background: "rgba(232,98,10,0.06)",
                  border: "1px solid rgba(232,98,10,0.15)",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", lineHeight: 1.6, fontStyle: "italic" }}>
                    &ldquo;{topReview.comment}&rdquo;
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--cs-orange)", marginTop: "4px", fontWeight: 600 }}>
                    — {topReview.user_name}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Prev / Next arrows */}
          {sessions.length > 1 && (
            <>
              <button onClick={prev} aria-label="Previous session"
                style={{ position: "absolute", left: "-20px", top: "40%", transform: "translateY(-50%)",
                  width: "40px", height: "40px", borderRadius: "50%",
                  background: "rgba(13,37,64,0.9)", border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem", zIndex: 10, transition: "border-color 0.15s, background 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,98,10,0.6)"; e.currentTarget.style.background = "rgba(232,98,10,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.background = "rgba(13,37,64,0.9)"; }}>
                ←
              </button>
              <button onClick={next} aria-label="Next session"
                style={{ position: "absolute", right: "-20px", top: "40%", transform: "translateY(-50%)",
                  width: "40px", height: "40px", borderRadius: "50%",
                  background: "rgba(13,37,64,0.9)", border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem", zIndex: 10, transition: "border-color 0.15s, background 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,98,10,0.6)"; e.currentTarget.style.background = "rgba(232,98,10,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.background = "rgba(13,37,64,0.9)"; }}>
                →
              </button>
            </>
          )}

          {/* Dots */}
          {sessions.length > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginTop: "1.5rem" }}>
              {sessions.map((_, i) => (
                <button key={i} onClick={() => goTo(i)} aria-label={`Session ${i + 1}`}
                  style={{ width: i === current ? "24px" : "8px", height: "8px", borderRadius: "4px", border: "none",
                    background: i === current ? "var(--cs-orange)" : "rgba(255,255,255,0.2)",
                    cursor: "pointer", transition: "all 0.3s ease", padding: 0 }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
