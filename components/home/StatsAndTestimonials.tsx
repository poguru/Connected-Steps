"use client";

import { useEffect, useState, useRef } from "react";
import { Users, Activity, Dumbbell, MessageSquare, Quote, Star } from "lucide-react";

const FALLBACK_STORIES = [
  { id: -1, user_name: "Priya Sharma",  achievement: "Ran first 10K in 2025",         quote: "I went from 'I can't run a kilometre' to finishing my first 10K in four months. The coaches and community made all the difference.", rating: 5 },
  { id: -2, user_name: "Rohan Mehta",   achievement: "Hyderabad Marathon finisher",    quote: "The plan adapted around my work travel. I shaved 14 minutes off my PB. Best part — the people I run with are now my closest friends.", rating: 5 },
  { id: -3, user_name: "Anjali Reddy",  achievement: "Corporate wellness lead",        quote: "We ran a 6-week challenge for 80 employees. Engagement was through the roof. Connected Steps made the rollout effortless.", rating: 5 },
];

interface Story { id: number; user_name: string; achievement: string; quote: string; rating: number | null; }

interface Stats {
  totalRunners:       number;
  activeThisMonth:    number;
  trainingsConducted: number;
  communityPosts:     number;
  coachCount:         number;
  avgRating:          number | null;
}

// ── Animated count-up ─────────────────────────────────────────────────────────
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [count,   setCount]   = useState(0);
  const ref     = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    started.current = false;
    setCount(0);
  }, [to]);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const t0 = Date.now();
        const dur = 2000;
        const tick = () => {
          const p = Math.min((Date.now() - t0) / dur, 1);
          setCount(Math.floor((1 - Math.pow(1 - p, 3)) * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────
function StatSkeleton() {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", padding: "1.25rem", boxShadow: "var(--shadow-md)" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--border)", marginBottom: "1.25rem",
        animation: "cs-shimmer 1.4s infinite",
        backgroundImage: "linear-gradient(90deg, var(--border) 25%, var(--surface-elevated) 50%, var(--border) 75%)",
        backgroundSize: "200% 100%",
      }} />
      <div style={{ height: 36, width: "60%", borderRadius: 6, marginBottom: 8,
        animation: "cs-shimmer 1.4s infinite",
        backgroundImage: "linear-gradient(90deg, var(--border) 25%, var(--surface-elevated) 50%, var(--border) 75%)",
        backgroundSize: "200% 100%",
      }} />
      <div style={{ height: 14, width: "80%", borderRadius: 4,
        animation: "cs-shimmer 1.4s infinite",
        backgroundImage: "linear-gradient(90deg, var(--border) 25%, var(--surface-elevated) 50%, var(--border) 75%)",
        backgroundSize: "200% 100%",
      }} />
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function StatsAndTestimonials() {
  const [stories, setStories] = useState<Story[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stories")
      .then(r => r.json())
      .then(d => { if (d.stories?.length) setStories(d.stories); })
      .catch(() => {});

    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const display = stories.length ? stories : FALLBACK_STORIES;

  // ── Stat cards definition — 4 real metrics, no fake fallbacks ────────────
  const statCards = [
    {
      icon:  Users,
      label: "Registered Members",
      value: stats?.totalRunners       ?? 0,
      suffix: "",
      grad:  "bg-gradient-primary",
      zero:  "Be the first member",
    },
    {
      icon:  Activity,
      label: "Active This Month",
      value: stats?.activeThisMonth    ?? 0,
      suffix: "",
      grad:  "bg-gradient-accent",
      zero:  "No activity yet",
    },
    {
      icon:  Dumbbell,
      label: "Sessions Conducted",
      value: stats?.trainingsConducted ?? 0,
      suffix: "",
      grad:  "bg-gradient-cyan",
      zero:  "Coming soon",
    },
    {
      icon:  MessageSquare,
      label: "Community Posts",
      value: stats?.communityPosts     ?? 0,
      suffix: "",
      grad:  "bg-gradient-primary",
      zero:  "No posts yet",
    },
  ];

  return (
    <>
      <style>{`
        @keyframes cs-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Stats grid ── */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "5rem 1.5rem" }}>
        <div style={{ display: "grid", gap: "1rem" }} className="sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
            : statCards.map((s) => (
              <div key={s.label}
                style={{ position: "relative", overflow: "hidden", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", padding: "1.25rem", boxShadow: "var(--shadow-md)", transition: "transform 0.2s, box-shadow 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}
              >
                {/* Icon */}
                <div style={{ width: 48, height: 48, borderRadius: 12, display: "grid", placeItems: "center", color: "#fff", boxShadow: "var(--shadow-md)", marginBottom: "1.25rem" }} className={s.grad}>
                  <s.icon size={20} />
                </div>

                {/* Value */}
                <div className="font-display" style={{ fontSize: "2.25rem", fontWeight: 700, color: "var(--foreground)", minHeight: 44, display: "flex", alignItems: "center" }}>
                  {s.value > 0
                    ? <CountUp to={s.value} suffix={s.suffix} />
                    : <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", fontWeight: 400 }}>{s.zero}</span>
                  }
                </div>

                {/* Label */}
                <div style={{ marginTop: 4, fontSize: "0.875rem", color: "var(--muted-foreground)" }}>{s.label}</div>
              </div>
            ))
          }
        </div>

        {/* Coach count strip — shown below grid, only when loaded */}
        {!loading && stats && stats.coachCount > 0 && (
          <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              <span style={{ fontWeight: 700, color: "var(--foreground)", fontSize: "1rem" }}>{stats.coachCount}</span>
              expert coaches · national-level athletes &amp; certified professionals
            </div>
          </div>
        )}
      </section>

      {/* ── Testimonials ── */}
      <section style={{ background: "var(--gradient-soft)", padding: "5rem 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 1.5rem" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--primary)", marginBottom: "0.75rem" }}>
              Runner Stories
            </div>
            <h2 className="font-display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 700, letterSpacing: "-0.015em", color: "var(--foreground)" }}>
              Real runners. <span className="text-gradient-primary">Real results.</span>
            </h2>

            {/* Avg rating — only if real ratings exist */}
            {!loading && stats?.avgRating != null && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: "1rem", background: "oklch(0.72 0.19 49 / 8%)", border: "1px solid oklch(0.72 0.19 49 / 20%)", borderRadius: 999, padding: "6px 16px" }}>
                {[1,2,3,4,5].map(i => <Star key={i} size={14} style={{ fill: "var(--accent)", color: "var(--accent)" }} />)}
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--accent)" }}>{stats.avgRating} / 5</span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>from verified members</span>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "1.25rem" }} className="sm:grid-cols-2 lg:grid-cols-3">
            {display.slice(0, 3).map((s) => (
              <div key={s.id}
                style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem", boxShadow: "var(--shadow-md)", borderTop: "2px solid var(--cs-orange)" }}>
                <Quote size={20} style={{ color: "var(--primary)", opacity: 0.5 }} />
                <div style={{ display: "flex", gap: 2 }}>
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} size={13} style={{ fill: i <= (s.rating ?? 5) ? "var(--accent)" : "var(--muted)", color: i <= (s.rating ?? 5) ? "var(--accent)" : "var(--muted)" }} />
                  ))}
                </div>
                <p className="font-display" style={{ fontSize: "1rem", fontWeight: 400, fontStyle: "italic", color: "var(--foreground)", lineHeight: 1.65, flex: 1 }}>
                  &ldquo;{s.quote}&rdquo;
                </p>
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--gradient-primary)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {initials(s.user_name)}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)" }}>{s.user_name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>{s.achievement}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
