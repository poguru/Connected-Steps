"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Star, Activity } from "lucide-react";
import { motion } from "framer-motion";

function CountUp({ to, suffix = "", duration = 2000 }: { to: number; suffix?: string; duration?: number }) {
  const [count,   setCount]   = useState(0);
  const ref     = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

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

export default function Hero() {
  const [stats, setStats] = useState({ totalRunners: 0, trainingsConducted: 0, avgRating: 4.9 });

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(d => setStats(d)).catch(() => {});
  }, []);

  return (
    <section className="relative overflow-hidden bg-gradient-soft">
      <div className="dot-bg absolute inset-0 opacity-50" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: "oklch(0.74 0.2 50 / 20%)" }} />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: "oklch(0.72 0.19 49 / 15%)" }} />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "3rem 1.5rem 5rem", display: "grid", gap: "3rem", alignItems: "center" }}
        className="lg:grid-cols-2 lg:gap-16 lg:py-20">

        {/* Left */}
        <div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999,
              border: "1px solid var(--border)", background: "var(--surface)",
              padding: "6px 14px", fontSize: 12, fontWeight: 500,
              color: "var(--muted-foreground)", marginBottom: "1.5rem",
              boxShadow: "var(--shadow-md)" }}>
            <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
              <span className="animate-pulse-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)" }} />
              <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
            </span>
            Hyderabad&rsquo;s #1 running community
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display"
            style={{ fontSize: "clamp(2.8rem, 7vw, 4.5rem)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.015em", color: "var(--foreground)" }}>
            Run Together.
            <br />
            <span className="text-gradient-primary">Grow</span>{" "}
            <span className="text-gradient-accent">Together.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ marginTop: "1.5rem", maxWidth: 520, fontSize: "1.1rem", color: "var(--muted-foreground)", lineHeight: 1.7 }}>
            Join a community-first fitness club with elite coaches, group runs, training programs,
            and corporate wellness — built to help every step matter.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            style={{ marginTop: "2.25rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <Link href="/auth?tab=register"
              style={{ display: "inline-flex", alignItems: "center", gap: 8,
                borderRadius: 999, background: "var(--gradient-accent)",
                padding: "14px 28px", fontSize: "0.95rem", fontWeight: 600,
                color: "var(--accent-foreground)", textDecoration: "none",
                boxShadow: "var(--shadow-orange)", transition: "transform 0.2s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}>
              Join Community <ArrowRight size={16} />
            </Link>
            <Link href="/running-club-hyderabad"
              style={{ display: "inline-flex", alignItems: "center", gap: 8,
                borderRadius: 999, border: "1px solid var(--border)",
                background: "var(--surface)", padding: "14px 28px",
                fontSize: "0.95rem", fontWeight: 600,
                color: "var(--foreground)", textDecoration: "none",
                boxShadow: "var(--shadow-md)", transition: "background 0.2s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface-elevated)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--surface)"}>
              Explore Programs
            </Link>
          </motion.div>

          {/* Social proof */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.45 }}
            style={{ marginTop: "2.5rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1.5rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex" }}>
                {["A","B","C","D"].map((l, i) => (
                  <div key={l} style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "#fff", marginLeft: i === 0 ? 0 : -8, border: "2px solid var(--background)", background: ["var(--gradient-primary)","var(--gradient-accent)","linear-gradient(135deg,oklch(0.72 0.14 210),oklch(0.6 0.18 210))","linear-gradient(135deg,oklch(0.55 0.18 300),oklch(0.45 0.22 300))"][i] }}>
                    {l}
                  </div>
                ))}
              </div>
              <span><span style={{ fontWeight: 600, color: "var(--foreground)" }}><CountUp to={stats.totalRunners || 500} suffix="+" /></span> runners joined</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {[1,2,3,4,5].map(i => <Star key={i} size={16} style={{ fill: "var(--accent)", color: "var(--accent)" }} />)}
              <span><span style={{ fontWeight: 600, color: "var(--foreground)" }}>{stats.avgRating ?? 4.9}</span> avg rating</span>
            </div>
          </motion.div>
        </div>

        {/* Right — hero card */}
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.2 }}
          className="relative hidden lg:block">
          <div style={{ position: "absolute", inset: -24, borderRadius: 32, background: "var(--gradient-accent)", opacity: 0.2, filter: "blur(32px)" }} />
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            {/* Placeholder hero image */}
            <div style={{ aspectRatio: "4/3", background: "linear-gradient(135deg, oklch(0.19 0.015 270) 0%, oklch(0.28 0.06 40) 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>🏃</div>
                <div className="font-display" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>Run. Together.</div>
                <div style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginTop: "0.5rem" }}>Hyderabad's running community</div>
              </div>
            </div>

            {/* Live now card */}
            <div className="glass" style={{ position: "absolute", top: 16, left: 16, borderRadius: 16, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--gradient-accent)", display: "grid", placeItems: "center", color: "#fff" }}>
                  <Activity size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }}>Live now</div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>Sessions this week</div>
                </div>
              </div>
            </div>

            {/* Stats card */}
            <div style={{ position: "absolute", bottom: 16, right: 16, borderRadius: 16, padding: 16, background: "var(--gradient-primary)", color: "#fff", boxShadow: "var(--shadow-glow)" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>This month</div>
              <div className="font-display" style={{ marginTop: 4, fontSize: "1.5rem", fontWeight: 700 }}>
                <CountUp to={stats.trainingsConducted || 200} suffix="+ sessions" />
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>conducted</div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
