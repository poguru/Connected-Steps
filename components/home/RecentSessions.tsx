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
  const [paused,   setPaused]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchX   = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/sessions/recent")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const goTo = useCallback((idx: number) => setCurrent(idx), []);
  const next = useCallback(() => setCurrent((c) => (c + 1) % sessions.length), [sessions.length]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + sessions.length) % sessions.length), [sessions.length]);

  useEffect(() => {
    if (paused || sessions.length <= 1) return;
    timerRef.current = setInterval(next, 6000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, sessions.length, next]);

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; setPaused(true); };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(delta) > 50) delta < 0 ? next() : prev();
    touchX.current = null; setPaused(false);
  };

  if (loading || sessions.length === 0) return null;

  const s = sessions[current];
  const dateStr = new Date(s.date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <section id="recent-sessions" style={{ background: "var(--cs-black)", padding: "5rem 0" }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
            What our community has been running — straight from the field.
          </p>
        </div>

        {/* Card */}
        <div style={{ maxWidth: "720px", margin: "0 auto", position: "relative" }}>
          <div style={{
            background: "var(--cs-dark)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            overflow: "hidden",
          }}>

            {/* Photo */}
            {s.photo_url && (
              <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", overflow: "hidden" }}>
                <img src={s.photo_url} alt={s.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
                {/* Counter badge */}
                <div style={{ position: "absolute", top: "1rem", right: "1rem",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: "20px",
                  padding: "4px 12px", fontSize: "11px", color: "rgba(255,255,255,0.8)", letterSpacing: "0.06em" }}>
                  {current + 1} / {sessions.length}
                </div>
              </div>
            )}

            {/* Session info */}
            <div style={{ padding: "1.5rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.4rem" }}>
                Community · Recent Session
              </div>
              <h3 className="font-display" style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 300, color: "var(--cs-white)", lineHeight: 1.2, marginBottom: "0.6rem" }}>
                {s.title}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", color: "var(--cs-muted)", marginBottom: "1rem" }}>
                <span>📅 {dateStr}{s.time ? ` · ${s.time}` : ""}</span>
                <span>📍 {s.venue || s.location}</span>
              </div>

              {/* Rating summary */}
              {s.avgRating !== null && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.25rem", paddingBottom: "1.25rem", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <Stars rating={s.avgRating} />
                  <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.avgRating.toFixed(1)}</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--cs-muted)" }}>
                    {s.reviewCount} review{s.reviewCount !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* All reviews */}
              {s.feedback && s.feedback.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {s.feedback.filter((f) => f.comment).map((f, i) => (
                    <div key={i} style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                      padding: "0.75rem 1rem",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--cs-white)" }}>{f.user_name}</span>
                        <Stars rating={f.rating} />
                      </div>
                      <p style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                        &ldquo;{f.comment}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Prev / Next arrows — hidden on mobile (swipe instead) */}
          {sessions.length > 1 && (
            <>
              <button onClick={prev} aria-label="Previous" className="hero-slider-arrow"
                style={{ position: "absolute", left: "-20px", top: "30%", transform: "translateY(-50%)",
                  width: "40px", height: "40px", borderRadius: "50%",
                  background: "rgba(13,37,64,0.9)", border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem", zIndex: 10, transition: "border-color 0.15s, background 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,98,10,0.6)"; e.currentTarget.style.background = "rgba(232,98,10,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.background = "rgba(13,37,64,0.9)"; }}>
                ←
              </button>
              <button onClick={next} aria-label="Next" className="hero-slider-arrow"
                style={{ position: "absolute", right: "-20px", top: "30%", transform: "translateY(-50%)",
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
