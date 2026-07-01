"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";

const STEPS = [
  {
    icon: "🚶",
    title: "Start Walking",
    distance: "0 – 2 km",
    description: "Build a habit. No experience needed. We start where you are.",
    time: "Week 1–2",
    color: "#60a5fa",
  },
  {
    icon: "🏃",
    title: "First 5K",
    distance: "5 km",
    description: "Your first milestone. Structured run-walk intervals guided by coaches.",
    time: "Month 1–3",
    color: "#a78bfa",
  },
  {
    icon: "⚡",
    title: "10K Strong",
    distance: "10 km",
    description: "Build endurance. Speed work and longer weekend runs every week.",
    time: "Month 3–6",
    color: "#fbbf24",
  },
  {
    icon: "🌅",
    title: "Half Marathon",
    distance: "21.1 km",
    description: "Race-ready. Tempo runs, long runs, and race-day strategy.",
    time: "Month 6–9",
    color: "#34d399",
  },
  {
    icon: "🏆",
    title: "Full Marathon",
    distance: "42.2 km",
    description: "The ultimate goal. NIS-certified coaches take you all the way.",
    time: "Month 9–12",
    color: "var(--cs-orange)",
  },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.querySelectorAll(".cs-reveal,.cs-reveal-l,.cs-reveal-r,.cs-reveal-s").forEach(e => e.classList.add("cs-vis"));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("cs-vis");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    el.querySelectorAll(".cs-reveal,.cs-reveal-l,.cs-reveal-r,.cs-reveal-s").forEach(e => obs.observe(e));
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function RunningJourney() {
  const ref = useReveal();

  return (
    <section
      ref={ref}
      style={{
        padding: "clamp(4rem, 10vh, 7rem) 0",
        background: "var(--background)",
        overflow: "hidden",
      }}
    >
      <div className="container">

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <div className="cs-reveal cs-section-badge" style={{ justifyContent: "center", marginLeft: "auto", marginRight: "auto", width: "fit-content" }}>
            Your Running Journey
          </div>
          <h2
            className="cs-reveal cs-d1 font-display"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
              fontWeight: 300,
              color: "var(--foreground)",
              lineHeight: 1.1,
              marginBottom: "1rem",
            }}
          >
            Every runner starts{" "}
            <em style={{
              fontStyle: "normal",
              background: "linear-gradient(135deg, oklch(0.78 0.18 55), oklch(0.68 0.22 30))",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>
              somewhere.
            </em>
          </h2>
          <p className="cs-reveal cs-d2" style={{
            fontSize: "1rem", color: "var(--muted-foreground)", maxWidth: 480, margin: "0 auto",
          }}>
            We meet you at your level. Whether you can't run a block or are chasing a PB,
            Connected Steps has a structured path for you.
          </p>
        </div>

        {/* ── Journey steps (desktop: horizontal, mobile: vertical) ── */}
        <div className="cs-reveal cs-d2" style={{ position: "relative" }}>

          {/* Connecting line — desktop only */}
          <div className="hidden lg:block" style={{
            position: "absolute",
            top: 28, left: "10%", right: "10%",
            height: 2,
            background: "linear-gradient(to right, rgba(96,165,250,0.3), rgba(232,98,10,0.8))",
          }} aria-hidden />

          {/* Steps grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(1, 1fr)",
            gap: "1.5rem",
          }}
            className="sm:grid-cols-5 sm:gap-4"
          >
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className={`cs-journey-step cs-reveal cs-d${i + 1}`}
                style={{
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "center",
                  textAlign: "center",
                  /* Mobile: horizontal row */
                }}
              >
                {/* Node */}
                <div
                  className="cs-journey-node"
                  style={{ borderColor: `${step.color}40`, background: `${step.color}10` }}
                >
                  <span style={{ fontSize: "1.4rem" }}>{step.icon}</span>
                </div>

                {/* Labels */}
                <div style={{
                  display: "inline-flex", alignItems: "center",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: step.color,
                  background: `${step.color}12`,
                  border: `1px solid ${step.color}25`,
                  borderRadius: 999, padding: "2px 8px",
                  marginBottom: "0.5rem",
                }}>
                  {step.time}
                </div>

                <div style={{
                  fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)",
                  marginBottom: "0.25rem",
                }}>
                  {step.title}
                </div>

                <div style={{
                  fontSize: "0.7rem", fontWeight: 700,
                  color: step.color,
                  marginBottom: "0.5rem",
                }}>
                  {step.distance}
                </div>

                <p style={{
                  fontSize: "0.78rem", color: "var(--muted-foreground)",
                  lineHeight: 1.5, margin: 0,
                  maxWidth: "16ch",
                }}>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div className="cs-reveal cs-d4" style={{ textAlign: "center", marginTop: "3.5rem" }}>
          <Link
            href="/running-club-hyderabad"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: "0.875rem", fontWeight: 600,
              color: "var(--cs-orange)", textDecoration: "none",
              border: "1px solid oklch(0.72 0.19 49 / 30%)",
              background: "oklch(0.72 0.19 49 / 6%)",
              borderRadius: 8, padding: "10px 20px",
              transition: "border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "oklch(0.72 0.19 49 / 55%)"; el.style.background = "oklch(0.72 0.19 49 / 10%)"; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "oklch(0.72 0.19 49 / 30%)"; el.style.background = "oklch(0.72 0.19 49 / 6%)"; }}
          >
            View all training programs <ArrowRight size={14} />
          </Link>
        </div>

      </div>
    </section>
  );
}
