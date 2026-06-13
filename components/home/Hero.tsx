"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Star } from "lucide-react";

// ── Animated count-up (starts when scrolled into view) ───────────────────────
function CountUp({ to, suffix = "", duration = 1800 }: { to: number; suffix?: string; duration?: number }) {
  const [count,   setCount]   = useState(0);
  const ref     = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    started.current = false;
    setCount(0);
  }, [to]);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0 = Date.now();
        const tick = () => {
          const p = Math.min((Date.now() - t0) / duration, 1);
          setCount(Math.floor((1 - Math.pow(1 - p, 3)) * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [to, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Skeleton shimmer block ────────────────────────────────────────────────────
function Skeleton({ width = 48, height = 20 }: { width?: number; height?: number }) {
  return (
    <span style={{
      display: "inline-block", width, height,
      borderRadius: 4,
      background: "linear-gradient(90deg, var(--border) 25%, var(--surface-elevated) 50%, var(--border) 75%)",
      backgroundSize: "200% 100%",
      animation: "cs-shimmer 1.4s infinite",
      verticalAlign: "middle",
    }} />
  );
}

interface Stats {
  totalRunners:       number;
  activeThisMonth:    number;
  trainingsConducted: number;
  communityPosts:     number;
  avgRating:          number | null;
}

export default function Hero() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Stat strip values — only show real data, never fake fallbacks
  const stripStats = [
    { val: stats?.totalRunners       ?? 0, suffix: "",  label: "Runners"        },
    { val: stats?.trainingsConducted ?? 0, suffix: "+", label: "Sessions"       },
    { val: stats?.activeThisMonth    ?? 0, suffix: "",  label: "Active / month" },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-soft animate-fade-in">
      <style>{`
        @keyframes cs-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div className="dot-bg absolute inset-0 opacity-50" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: "oklch(0.74 0.2 50 / 18%)" }} />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "2.5rem 1.5rem 3rem" }}
        className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">

        {/* ── Left ─────────────────────────────────────────────────────── */}
        <div className="animate-fade-up">

          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999,
            border: "1px solid var(--border)", background: "var(--surface)",
            padding: "5px 12px", fontSize: 11, fontWeight: 500,
            color: "var(--muted-foreground)", marginBottom: "1.25rem",
            boxShadow: "var(--shadow-md)" }}>
            <span style={{ position: "relative", display: "inline-flex", width: 7, height: 7 }}>
              <span className="animate-pulse-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)" }} />
              <span style={{ position: "relative", display: "inline-flex", width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />
            </span>
            NIS-certified coaching, Hyderabad
          </div>

          {/* Headline */}
          <h1 className="font-display animate-fade-up-1"
            style={{ fontSize: "clamp(2.2rem, 6vw, 3.75rem)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.015em", color: "var(--foreground)", marginBottom: "1rem" }}>
            First 5K. First marathon.{" "}
            <span className="text-gradient-accent">One community.</span>
          </h1>

          {/* Sub */}
          <p className="animate-fade-up-2" style={{ maxWidth: 500, fontSize: "1rem", color: "var(--muted-foreground)", lineHeight: 1.7, marginBottom: "1.75rem" }}>
            Structured marathon prep, weekly group runs, and coaching that doesn&apos;t stop when the session ends.
          </p>

          {/* CTAs */}
          <div className="hero-cta animate-fade-up-3">
            <Link href="/auth?tab=register"
              style={{ display: "inline-flex", alignItems: "center", gap: 8,
                borderRadius: 8, background: "var(--gradient-accent)",
                padding: "12px 24px", fontSize: "0.9rem", fontWeight: 600,
                color: "var(--accent-foreground)", textDecoration: "none",
                boxShadow: "var(--shadow-orange)" }}>
              Get my free account <ArrowRight size={15} />
            </Link>
            <Link href="/pricing"
              style={{ display: "inline-flex", alignItems: "center", gap: 8,
                borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--surface)", padding: "12px 24px",
                fontSize: "0.9rem", fontWeight: 500,
                color: "var(--foreground)", textDecoration: "none" }}>
              See plans from ₹40/day
            </Link>
          </div>

          {/* ── Trust row ── */}
          <div className="animate-fade-up-4" style={{ marginTop: "1.75rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1.25rem", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>

            {/* Runner count — only render when loaded and > 0 */}
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex" }}>
                  {["A","B","C","D"].map((l, i) => (
                    <div key={l} style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: "#fff", marginLeft: i === 0 ? 0 : -7, border: "2px solid var(--background)", background: ["var(--gradient-primary)","var(--gradient-accent)","linear-gradient(135deg,oklch(0.72 0.14 210),oklch(0.6 0.18 210))","linear-gradient(135deg,oklch(0.55 0.18 300),oklch(0.45 0.22 300))"][i] }}>
                      {l}
                    </div>
                  ))}
                </div>
                <Skeleton width={90} height={16} />
              </div>
            ) : stats && stats.totalRunners > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex" }}>
                  {["A","B","C","D"].map((l, i) => (
                    <div key={l} style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: "#fff", marginLeft: i === 0 ? 0 : -7, border: "2px solid var(--background)", background: ["var(--gradient-primary)","var(--gradient-accent)","linear-gradient(135deg,oklch(0.72 0.14 210),oklch(0.6 0.18 210))","linear-gradient(135deg,oklch(0.55 0.18 300),oklch(0.45 0.22 300))"][i] }}>
                      {l}
                    </div>
                  ))}
                </div>
                <span>
                  <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                    <CountUp to={stats.totalRunners} />
                  </span>{" "}
                  runners joined
                </span>
              </div>
            ) : null}

            {/* Avg rating — only show when real ratings exist */}
            {loading ? (
              <Skeleton width={100} height={16} />
            ) : stats?.avgRating != null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {[1,2,3,4,5].map(i => (
                  <Star key={i} size={13} style={{ fill: "var(--accent)", color: "var(--accent)" }} />
                ))}
                <span>
                  <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{stats.avgRating}</span> avg rating
                </span>
              </div>
            ) : null}

          </div>
        </div>

        {/* ── Right — quick stats panel (desktop only) ─────────────────── */}
        <div className="relative hidden lg:block animate-fade-up-2">
          <div style={{ position: "absolute", inset: -20, borderRadius: 28, background: "var(--gradient-accent)", opacity: 0.12, filter: "blur(28px)" }} />
          <div style={{ position: "relative", borderRadius: 20, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}>

            {/* Hero visual */}
            <div style={{ padding: "2rem", background: "linear-gradient(135deg, oklch(0.17 0.015 270) 0%, oklch(0.24 0.055 40) 100%)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "4rem", marginBottom: "0.75rem" }}>🏃</div>
                <div className="font-display" style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--foreground)" }}>Every step counts.</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: "0.35rem" }}>Join Hyderabad&apos;s running community</div>
              </div>
            </div>

            {/* Stat strip — real data only */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid var(--border)" }}>
              {stripStats.map((s, i) => (
                <div key={s.label} style={{ padding: "1rem", textAlign: "center", borderLeft: i > 0 ? "1px solid var(--border)" : "none" }}>
                  <div className="font-display" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cs-orange)", lineHeight: 1, minHeight: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {loading
                      ? <Skeleton width={40} height={24} />
                      : <CountUp to={s.val} suffix={s.val > 0 ? s.suffix : ""} />
                    }
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
