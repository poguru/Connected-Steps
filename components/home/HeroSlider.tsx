"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface RecentSession {
  id: string; title: string; date: string; time: string | null;
  venue: string | null; location: string; photo_url: string | null;
  avgRating: number | null; reviewCount: number;
  feedback: { user_name: string; rating: number; comment: string }[];
}

function Stars({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width="14" height="14" viewBox="0 0 24 24">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            fill={s <= Math.round(rating) ? "#e8620a" : "rgba(255,255,255,0.25)"}
            stroke={s <= Math.round(rating) ? "#e8620a" : "rgba(255,255,255,0.2)"} strokeWidth="1" />
        </svg>
      ))}
    </div>
  );
}

export default function HeroSlider() {
  const [loggedIn,  setLoggedIn]  = useState(false);
  const [members,   setMembers]   = useState<number | null>(null);
  const [runs,      setRuns]      = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [sessions,  setSessions]  = useState<RecentSession[]>([]);
  const [current,   setCurrent]   = useState(0);
  const [paused,    setPaused]    = useState(false);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchX    = useRef<number | null>(null);

  const total = 1 + sessions.length; // slide 0 = Hero, rest = sessions

  const fmt = (n: number | null) =>
    n === null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}K+` : `${n}`;

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("cs_user")) setLoggedIn(true);
    fetch("/api/stats").then((r) => r.json()).then((d) => {
      setMembers(d.totalRunners); setRuns(d.weekendRuns); setAvgRating(d.avgRating);
    }).catch(() => {});
    fetch("/api/sessions/recent").then((r) => r.json()).then((d) => setSessions(d.sessions ?? [])).catch(() => {});
  }, []);

  const goTo = useCallback((idx: number) => setCurrent(idx), []);
  const next = useCallback(() => setCurrent((c) => (c + 1) % total), [total]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + total) % total), [total]);

  useEffect(() => {
    if (paused || total <= 1) return;
    timerRef.current = setInterval(next, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, total, next]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(delta) > 50) delta < 0 ? next() : prev();
    touchX.current = null;
    setPaused(false);
  };

  return (
    <section
      className="relative noise"
      style={{ minHeight: "100vh", overflow: "hidden", background: "var(--cs-black)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Sliding track ── */}
      <div style={{
        display: "flex",
        width: `${total * 100}%`,
        height: "100%",
        minHeight: "100vh",
        transform: `translateX(-${(current / total) * 100}%)`,
        transition: "transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}>

        {/* ── Slide 0: Hero ── */}
        <div style={{ width: `${100 / total}%`, minHeight: "100vh", position: "relative", flexShrink: 0 }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,98,10,0.1) 0%, transparent 70%)" }} />
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{ backgroundImage: "linear-gradient(var(--cs-white) 1px, transparent 1px), linear-gradient(90deg, var(--cs-white) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />

          <div className="container relative z-10" style={{ paddingTop: "8rem", paddingBottom: "6rem" }}>
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="section-label animate-fade-up">Connected Steps</div>
                <h1 className="font-display animate-fade-up-1 mb-6"
                  style={{ fontSize: "clamp(2rem, 7vw, 5.5rem)", fontWeight: 300, color: "var(--cs-white)", lineHeight: 1.1 }}>
                  Every step,{" "}
                  <em className="not-italic" style={{ color: "var(--cs-orange)" }}>a plan</em>
                  <br />behind it.
                </h1>
                <p className="text-base leading-relaxed mb-10 max-w-md animate-fade-up-2"
                  style={{ color: "var(--cs-muted)", fontSize: "1.05rem" }}>
                  Connected Steps pairs you with elite coaches and a training community that keeps you
                  accountable — from your first kilometre to your finish-line moment.
                </p>
                <div className="animate-fade-up-3 hero-cta">
                  <Link href={loggedIn ? "/dashboard" : "/auth"} className="btn-primary">
                    {loggedIn ? "Go to Dashboard" : "Start training free"}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                  <Link href="#training" className="btn-outline">See training plans</Link>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-8 animate-fade-up-4 pt-8"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  {[
                    { num: fmt(members),  label: "Members" },
                    { num: fmt(runs),     label: "Run registrations" },
                    { num: avgRating ? `${avgRating}★` : "—", label: "Coach rating" },
                  ].map((s) => (
                    <div key={s.label} style={{ minWidth: "80px" }}>
                      <div className="font-display text-2xl font-light" style={{ color: "var(--cs-white)" }}>{s.num}</div>
                      <div className="text-xs tracking-wide uppercase mt-0.5" style={{ color: "var(--cs-muted)" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hidden lg:flex items-center justify-center">
                <div className="relative animate-float">
                  <div className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(245,200,66,0.15)", transform: "scale(1.25)" }} />
                  <div className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(232,98,10,0.1)", transform: "scale(1.5)" }} />
                  <div className="relative w-72 h-72 rounded-full flex items-center justify-center"
                    style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(232,98,10,0.2)" }}>
                    <Image src="/logo.png" alt="Connected Steps" width={220} height={220} className="rounded-full" priority />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Slides 1-N: Recent Sessions ── */}
        {sessions.map((s) => {
          const dateStr = new Date(s.date + "T12:00:00Z").toLocaleDateString("en-IN", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          });
          const topReview = s.feedback?.find((f) => f.comment);
          return (
            <div key={s.id} style={{ width: `${100 / total}%`, minHeight: "100vh", position: "relative", flexShrink: 0 }}>
              {/* Full-bleed photo */}
              {s.photo_url && (
                <img src={s.photo_url} alt={s.title}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }} />
              )}
              {/* Gradient overlay */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(13,13,16,0.97) 0%, rgba(13,13,16,0.55) 50%, rgba(13,13,16,0.2) 100%)" }} />

              {/* Content */}
              <div className="container relative z-10" style={{ paddingTop: "8rem", paddingBottom: "7rem", height: "100%", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: "700px" }}>
                  <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>
                    Community · Recent Session
                  </div>
                  <h2 className="font-display" style={{ fontSize: "clamp(2rem, 5vw, 4rem)", fontWeight: 300, color: "#fff", lineHeight: 1.1, marginBottom: "0.75rem" }}>
                    {s.title}
                  </h2>
                  <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.65)", marginBottom: "1.25rem" }}>
                    📅 {dateStr}{s.time ? ` · ${s.time}` : ""}&nbsp;&nbsp;📍 {s.venue || s.location}
                  </div>

                  {s.avgRating !== null && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1.25rem" }}>
                      <Stars rating={s.avgRating} />
                      <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.avgRating.toFixed(1)}</span>
                      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>({s.reviewCount} review{s.reviewCount !== 1 ? "s" : ""})</span>
                    </div>
                  )}

                  {topReview && (
                    <div style={{ borderLeft: "3px solid var(--cs-orange)", paddingLeft: "1rem", maxWidth: "520px" }}>
                      <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.75)", fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>
                        &ldquo;{topReview.comment}&rdquo;
                      </p>
                      <div style={{ fontSize: "0.78rem", color: "var(--cs-orange)", marginTop: "4px", fontWeight: 600 }}>— {topReview.user_name}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Prev / Next arrows (hidden on mobile — swipe instead) ── */}
      {total > 1 && (
        <>
          <button onClick={prev} aria-label="Previous" className="hero-slider-arrow"
            style={{ position: "absolute", left: "1.5rem", top: "50%", transform: "translateY(-50%)", zIndex: 20,
              width: "44px", height: "44px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(13,13,16,0.7)", color: "#fff", cursor: "pointer", fontSize: "1.1rem",
              display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)",
              transition: "border-color 0.15s, background 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,98,10,0.6)"; e.currentTarget.style.background = "rgba(232,98,10,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.background = "rgba(13,13,16,0.7)"; }}>
            ←
          </button>
          <button onClick={next} aria-label="Next" className="hero-slider-arrow"
            style={{ position: "absolute", right: "1.5rem", top: "50%", transform: "translateY(-50%)", zIndex: 20,
              width: "44px", height: "44px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(13,13,16,0.7)", color: "#fff", cursor: "pointer", fontSize: "1.1rem",
              display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)",
              transition: "border-color 0.15s, background 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,98,10,0.6)"; e.currentTarget.style.background = "rgba(232,98,10,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.background = "rgba(13,13,16,0.7)"; }}>
            →
          </button>
        </>
      )}

      {/* ── Dots ── */}
      {total > 1 && (
        <div style={{ position: "absolute", bottom: "2rem", left: "50%", transform: "translateX(-50%)", zIndex: 20,
          display: "flex", gap: "6px", alignItems: "center" }}>
          {Array.from({ length: total }).map((_, i) => (
            <button key={i} onClick={() => goTo(i)} aria-label={i === 0 ? "Hero" : `Session ${i}`}
              style={{ width: i === current ? "24px" : "8px", height: "8px", borderRadius: "4px", border: "none",
                background: i === current ? "var(--cs-orange)" : "rgba(255,255,255,0.3)",
                cursor: "pointer", transition: "all 0.3s ease", padding: 0 }} />
          ))}
        </div>
      )}

      {/* ── Slide label (top-right) ── */}
      {total > 1 && (
        <div style={{ position: "absolute", top: "5rem", right: "1.5rem", zIndex: 20,
          background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px",
          padding: "4px 12px", fontSize: "11px", color: "rgba(255,255,255,0.6)", letterSpacing: "0.06em" }}>
          {current + 1} / {total}
        </div>
      )}
    </section>
  );
}
