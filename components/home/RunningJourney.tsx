"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";

const STEPS = [
  {
    icon: "🚶",
    title: "Start Walking",
    shortLabel: "Walk",
    distance: "0–2 km",
    description: "No experience needed. We start where you are.",
    time: "Week 1–2",
    color: "#60a5fa",
  },
  {
    icon: "🏃",
    title: "First 5K",
    shortLabel: "5K",
    distance: "5 km",
    description: "Run-walk intervals guided by coaches.",
    time: "Month 1–3",
    color: "#a78bfa",
  },
  {
    icon: "⚡",
    title: "10K Strong",
    shortLabel: "10K",
    distance: "10 km",
    description: "Speed work and longer weekend runs.",
    time: "Month 3–6",
    color: "#fbbf24",
  },
  {
    icon: "🌅",
    title: "Half Marathon",
    shortLabel: "HM",
    distance: "21.1 km",
    description: "Tempo runs, long runs, race-day strategy.",
    time: "Month 6–9",
    color: "#34d399",
  },
  {
    icon: "🏆",
    title: "Full Marathon",
    shortLabel: "FM",
    distance: "42.2 km",
    description: "NIS-certified coaches take you all the way.",
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
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add("cs-vis"); obs.unobserve(entry.target); }
      }),
      { threshold: 0.1 },
    );
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
      style={{ padding: "clamp(3rem, 7vh, 5.5rem) 0", background: "var(--background)", overflow: "hidden" }}
    >
      <div className="container">

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: "clamp(1.5rem, 3.5vw, 3.5rem)" }}>
          <div
            className="cs-reveal cs-section-badge"
            style={{ justifyContent: "center", marginLeft: "auto", marginRight: "auto", width: "fit-content" }}
          >
            Your Running Journey
          </div>
          <h2
            className="cs-reveal cs-d1 font-display"
            style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", fontWeight: 300, color: "var(--foreground)", lineHeight: 1.1, marginBottom: "1rem" }}
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
          <p className="cs-reveal cs-d2" style={{ fontSize: "1rem", color: "var(--muted-foreground)", maxWidth: 480, margin: "0 auto" }}>
            We meet you at your level. Whether you can&apos;t run a block or are chasing a PB,
            Connected Steps has a structured path for you.
          </p>
        </div>

        {/* ── Mobile path bar: entire journey in one line ── */}
        <div className="cs-reveal cs-d1 cs-journey-path" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div key={s.shortLabel} style={{ display: "contents" }}>
              <div className="cs-journey-path-node">
                <span style={{ fontSize: "1.05rem", lineHeight: 1 }}>{s.icon}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: s.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {s.shortLabel}
                </span>
              </div>
              {i < STEPS.length - 1 && <div className="cs-journey-path-arrow" />}
            </div>
          ))}
        </div>

        {/* ── Cards: 2-col grid on mobile, 5-col on desktop ── */}
        <div className="cs-journey-grid cs-reveal cs-d2" style={{ position: "relative" }}>

          {/* Desktop connecting line */}
          <div
            className="hidden sm:block"
            style={{
              position: "absolute", top: 27, left: "10%", right: "10%",
              height: 2,
              background: "linear-gradient(to right, rgba(96,165,250,0.3), rgba(232,98,10,0.8))",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          />

          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className={`cs-jcard cs-reveal cs-d${i + 1}${i === STEPS.length - 1 ? " cs-jcard-solo" : ""}`}
            >
              <div className="cs-jcard-inner">
                {/* Icon */}
                <div
                  className="cs-jcard-icon"
                  style={{
                    background: `${step.color === "var(--cs-orange)" ? "rgba(232,98,10,0.12)" : `${step.color}12`}`,
                    border: `2px solid ${step.color === "var(--cs-orange)" ? "rgba(232,98,10,0.35)" : `${step.color}35`}`,
                  }}
                >
                  <span>{step.icon}</span>
                </div>

                {/* Text */}
                <div className="cs-jcard-body">
                  <span
                    className="cs-jcard-badge"
                    style={{
                      color: step.color,
                      background: `${step.color === "var(--cs-orange)" ? "rgba(232,98,10,0.1)" : `${step.color}10`}`,
                      border: `1px solid ${step.color === "var(--cs-orange)" ? "rgba(232,98,10,0.22)" : `${step.color}22`}`,
                    }}
                  >
                    {step.time}
                  </span>
                  <div className="cs-jcard-title">{step.title}</div>
                  <div className="cs-jcard-dist" style={{ color: step.color }}>{step.distance}</div>
                  <p className="cs-jcard-desc">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── CTA ── */}
        <div className="cs-reveal cs-d4" style={{ textAlign: "center", marginTop: "2.5rem" }}>
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
