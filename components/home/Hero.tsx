"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Star, Users, Zap } from "lucide-react";
import CommunityHighlights from "./CommunityHighlights";

// ── Animated count-up (Intersection Observer) ─────────────────────────────────
function CountUp({ to, suffix = "", duration = 2200 }: { to: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    started.current = false;
    setCount(0);
  }, [to]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(to);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0 = Date.now();
        const tick = () => {
          const p = Math.min((Date.now() - t0) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setCount(Math.floor(eased * to));
          if (p < 1) requestAnimationFrame(tick);
          else setCount(to);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [to, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

interface Stats {
  totalRunners: number;
  activeThisMonth: number;
  trainingsConducted: number;
  communityPosts: number;
  avgRating: number | null;
}

export default function Hero() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem("cs_user"));
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {});
  }, []);

  return (
    <section
      ref={heroRef}
      style={{
        position: "relative",
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      {/* ── Background ambiance ── */}
      <div className="cs-hero-glow-a" aria-hidden />
      <div className="cs-hero-glow-b" aria-hidden />

      {/* Subtle noise layer */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.025, pointerEvents: "none",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }} aria-hidden />

      {/* ── Main grid ── */}
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "clamp(5rem, 12vh, 8rem) 1.5rem clamp(3rem, 8vh, 5rem)",
        position: "relative", zIndex: 1,
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "3rem",
        width: "100%",
      }}
        className="lg:grid-cols-[55fr_45fr] lg:items-center lg:gap-16"
      >

        {/* ══ LEFT — headline + CTAs ══════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Badge */}
          <div className="animate-fade-up" style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            borderRadius: 999,
            border: "1px solid oklch(0.72 0.19 49 / 28%)",
            background: "oklch(0.72 0.19 49 / 7%)",
            padding: "6px 16px", marginBottom: "2rem",
            width: "fit-content",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const,
            color: "var(--cs-orange)",
          }}>
            <span style={{
              position: "relative", display: "inline-flex", width: 8, height: 8,
            }}>
              <span className="animate-pulse-ring" style={{
                position: "absolute", inset: 0, borderRadius: "50%", background: "var(--cs-orange)",
              }} />
              <span style={{
                position: "relative", width: 8, height: 8, borderRadius: "50%", background: "var(--cs-orange)", display: "block",
              }} />
            </span>
            NIS Certified Coaching · Hyderabad
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up-1 cs-hero-headline"
            style={{ marginBottom: "1.5rem" }}
          >
            First 5K.<br />
            First Marathon.<br />
            <em>One Community.</em>
          </h1>

          {/* Supporting text */}
          <p className="animate-fade-up-2" style={{
            maxWidth: 520,
            fontSize: "clamp(1rem, 1.8vw, 1.15rem)",
            color: "var(--muted-foreground)",
            lineHeight: 1.75,
            marginBottom: "2.5rem",
          }}>
            Join Hyderabad&apos;s growing running community with structured coaching,
            weekly sessions and marathon training — from your first kilometre to your finish-line moment.
          </p>

          {/* CTAs */}
          <div className="animate-fade-up-3" style={{
            display: "flex", flexWrap: "wrap" as const, gap: "0.875rem",
            marginBottom: "2.75rem",
          }}>
            <Link href={loggedIn ? "/dashboard" : "/auth?tab=register"} className="cs-hero-cta-primary">
              {loggedIn ? "Go to Dashboard" : "Join Now"}
              <ArrowRight size={16} />
            </Link>

            <Link href="/running-club-hyderabad" className="cs-hero-cta-secondary">
              Explore Programs
            </Link>
          </div>

          {/* ── Trust stats strip ── */}
          <div className="animate-fade-up-4" style={{
            display: "flex", flexWrap: "wrap" as const, gap: "0.75rem",
            paddingTop: "1.75rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}>
            {/* Runners */}
            <div className="cs-stat-pill">
              <Users size={14} style={{ color: "var(--cs-orange)", flexShrink: 0 }} />
              <span>
                <strong style={{ color: "var(--foreground)" }}>
                  {stats?.totalRunners
                    ? <CountUp to={stats.totalRunners} />
                    : "500+"}
                </strong>
                {" "}runners
              </span>
            </div>

            {/* Rating */}
            {stats?.avgRating != null && (
              <div className="cs-stat-pill">
                <span style={{ display: "flex", gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={11} style={{ fill: "#fbbf24", color: "#fbbf24", flexShrink: 0 }} />
                  ))}
                </span>
                <span><strong style={{ color: "var(--foreground)" }}>{stats.avgRating}</strong> avg rating</span>
              </div>
            )}

            {/* Sessions */}
            {stats?.trainingsConducted != null && stats.trainingsConducted > 0 && (
              <div className="cs-stat-pill">
                <Zap size={13} style={{ color: "var(--cs-orange)", flexShrink: 0 }} />
                <span>
                  <strong style={{ color: "var(--foreground)" }}>
                    <CountUp to={stats.trainingsConducted} />
                  </strong>
                  {" "}sessions run
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT — community card ════════════════════════════════════════ */}
        <div className="relative animate-fade-up-2" style={{ position: "relative" }}>
          {/* Glow behind card */}
          <div style={{
            position: "absolute",
            inset: "-24px",
            borderRadius: 32,
            background: "radial-gradient(ellipse at 60% 50%, oklch(0.72 0.19 49 / 18%) 0%, transparent 70%)",
            filter: "blur(20px)",
            pointerEvents: "none",
          }} aria-hidden />
          <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
            <CommunityHighlights />
          </div>
        </div>

      </div>

      {/* ── Scroll indicator ── */}
      <div
        className="animate-fade-up-4"
        style={{
          position: "absolute", bottom: "2rem", left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          opacity: 0.4,
        }}
        aria-hidden
      >
        <div style={{
          width: 24, height: 38, borderRadius: 12,
          border: "1.5px solid rgba(255,255,255,0.3)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: "5px 0",
        }}>
          <div style={{
            width: 3, height: 8, borderRadius: 2,
            background: "rgba(255,255,255,0.5)",
            animation: "cs-scroll-dot 1.6s ease-in-out infinite",
          }} />
        </div>
        <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.5)" }}>
          Scroll
        </span>
      </div>

      <style>{`
        @keyframes cs-scroll-dot {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50%       { transform: translateY(10px); opacity: 1; }
        }
      `}</style>
    </section>
  );
}
