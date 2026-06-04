"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Users, Calendar, Star, Quote } from "lucide-react";

const FALLBACK_STORIES = [
  { id: -1, user_name: "Priya Sharma",  achievement: "Ran first 10K in 2025",         quote: "I went from 'I can't run a kilometre' to finishing my first 10K in four months. The coaches and community made all the difference.", rating: 5 },
  { id: -2, user_name: "Rohan Mehta",   achievement: "Hyderabad Marathon finisher",    quote: "The plan adapted around my work travel. I shaved 14 minutes off my PB. Best part — the people I run with are now my closest friends.", rating: 5 },
  { id: -3, user_name: "Anjali Reddy",  achievement: "Corporate wellness lead",        quote: "We ran a 6-week challenge for 80 employees. Engagement was through the roof. Connected Steps made the rollout effortless.", rating: 5 },
];

interface Story { id: number; user_name: string; achievement: string; quote: string; rating: number | null; }

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [count,   setCount]   = useState(0);
  const ref     = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
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

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function StatsAndTestimonials() {
  const [stories,  setStories]  = useState<Story[]>([]);
  const [statsData, setStats]   = useState({ totalRunners: 0, trainingsConducted: 0, avgRating: 4.9 });

  useEffect(() => {
    fetch("/api/stories").then(r => r.json()).then(d => { if (d.stories?.length) setStories(d.stories); }).catch(() => {});
    fetch("/api/stats").then(r => r.json()).then(d => setStats(d)).catch(() => {});
  }, []);

  const display = stories.length ? stories : FALLBACK_STORIES;

  const stats = [
    { icon: Users,    label: "Community Members",  value: statsData.totalRunners        || 500,  suffix: "+", grad: "bg-gradient-primary" },
    { icon: Calendar, label: "Sessions Conducted",  value: statsData.trainingsConducted  || 200,  suffix: "+", grad: "bg-gradient-accent"  },
    { icon: Star,     label: "Expert Coaches",      value: 3,                                     suffix: "",  grad: "bg-gradient-cyan"    },
    { icon: Star,     label: "Avg Coach Rating",    value: statsData.avgRating           || 4.9,  suffix: "★", grad: "bg-gradient-primary" },
  ];

  return (
    <>
      {/* Stats */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "5rem 1.5rem" }}>
        <div style={{ display: "grid", gap: "1rem" }} className="sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div key={s.label}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }}
              style={{ position: "relative", overflow: "hidden", borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)", padding: "1.5rem", boxShadow: "var(--shadow-md)", transition: "transform 0.2s, box-shadow 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, display: "grid", placeItems: "center", color: "#fff", boxShadow: "var(--shadow-md)", marginBottom: "1.25rem" }} className={s.grad}>
                <s.icon size={20} />
              </div>
              <div className="font-display" style={{ fontSize: "2.25rem", fontWeight: 700, color: "var(--foreground)" }}>
                <CountUp to={typeof s.value === "number" ? s.value : 0} suffix={s.suffix} />
              </div>
              <div style={{ marginTop: 4, fontSize: "0.875rem", color: "var(--muted-foreground)" }}>{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ background: "var(--gradient-soft)", padding: "5rem 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 1.5rem" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--primary)", marginBottom: "0.75rem" }}>
              Runner Stories
            </div>
            <h2 className="font-display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 700, letterSpacing: "-0.015em", color: "var(--foreground)" }}>
              Real runners. <span className="text-gradient-primary">Real results.</span>
            </h2>
            {statsData.avgRating > 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: "1rem", background: "oklch(0.72 0.19 49 / 8%)", border: "1px solid oklch(0.72 0.19 49 / 20%)", borderRadius: 999, padding: "6px 16px" }}>
                {[1,2,3,4,5].map(i => <Star key={i} size={14} style={{ fill: "var(--accent)", color: "var(--accent)" }} />)}
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--accent)" }}>{statsData.avgRating} / 5</span>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "1.25rem" }} className="sm:grid-cols-2 lg:grid-cols-3">
            {display.slice(0, 3).map((s, i) => (
              <motion.div key={s.id}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                style={{ borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "var(--shadow-md)" }}>
                <Quote size={20} style={{ color: "var(--primary)", opacity: 0.5 }} />
                <div style={{ display: "flex", gap: 2 }}>
                  {[1,2,3,4,5].map(i => <Star key={i} size={13} style={{ fill: i <= (s.rating ?? 5) ? "var(--accent)" : "var(--muted)", color: i <= (s.rating ?? 5) ? "var(--accent)" : "var(--muted)" }} />)}
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
