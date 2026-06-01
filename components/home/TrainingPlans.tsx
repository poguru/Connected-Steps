"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

const plans = [
  {
    tier: "Starter", title: "5K", duration: "8 weeks",
    desc: "Perfect for first-timers. Build your base, run your first 5K with confidence.",
    features: ["3 runs per week", "Walk-run intervals", "Weekly coach check-in", "Nutrition basics"],
    color: "var(--cs-white)",
  },
  {
    tier: "Intermediate", title: "10K", duration: "10 weeks",
    desc: "Push past the 5K. Build speed, endurance, and race-day confidence for 10K.",
    features: ["4 runs per week", "Interval & tempo runs", "Weekly coach check-in", "Race strategy"],
    color: "var(--cs-white)",
  },
  {
    tier: "Builder", title: "Half Marathon", duration: "14 weeks",
    desc: "Take the leap to 21K. Structured tempo runs, long runs, and race strategy.",
    features: ["5 runs per week", "Tempo & interval sessions", "Bi-weekly coach call", "Race day plan"],
    color: "var(--cs-white)", featured: true,
  },
  {
    tier: "Elite", title: "Full Marathon", duration: "20 weeks",
    desc: "26.2 miles of purpose. For runners ready to go the full distance.",
    features: ["6 runs per week", "Strength & mobility", "Weekly 1-on-1 coaching", "GPS pace targets"],
    color: "var(--cs-white)",
  },
  {
    tier: "Wellness", title: "Weight Loss", duration: "8 weeks",
    desc: "Structured cardio and nutrition guidance to burn fat, build stamina, and feel confident.",
    features: ["3 sessions per week", "Cardio & fat-burn focus", "Nutrition guidance", "Progress tracking"],
    color: "var(--cs-white)",
  },
  {
    tier: "Power", title: "Strength", duration: "10 weeks",
    desc: "Build a stronger body with structured conditioning designed for runners and athletes.",
    features: ["3–4 sessions per week", "Progressive overload", "Core & stability", "Injury prevention"],
    color: "var(--cs-white)",
  },
];

export default function TrainingPlans() {
  const router  = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);

  const handleGetStarted = () => {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    router.push(user ? "/dashboard" : "/auth");
  };

  const scroll = (dir: "prev" | "next") => {
    const el = trackRef.current;
    if (!el) return;
    const cardW = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 16 : 280;
    el.scrollBy({ left: dir === "next" ? cardW : -cardW, behavior: "smooth" });
  };

  return (
    <section id="training" className="section" style={{ background: "var(--cs-dark)" }}>
      <div className="container">
        <div className="text-center mb-16">
          <span className="gold-line mx-auto" />
          <h2 className="font-display mt-4"
            style={{ fontSize: "clamp(2.8rem, 5vw, 4.5rem)", fontWeight: 300, color: "var(--cs-white)", letterSpacing: "-0.01em" }}>
            Training Plans
          </h2>
          <p style={{ marginTop: "1rem", fontSize: "1rem", color: "var(--cs-muted)", maxWidth: "480px", margin: "1rem auto 0" }}>
            Goal-specific programmes built by national-level coaches — for every runner, every goal.
          </p>
        </div>

        {/* Desktop: grid | Mobile: horizontal scroll carousel */}
        <div className="tp-desktop-grid">
          {plans.map((plan) => (
            <PlanCard key={plan.tier} plan={plan} onGetStarted={handleGetStarted} />
          ))}
        </div>

        <div className="tp-mobile-carousel">
          <div ref={trackRef} className="tp-track">
            {plans.map((plan) => (
              <PlanCard key={plan.tier} plan={plan} onGetStarted={handleGetStarted} mobile />
            ))}
          </div>
          {/* Arrows */}
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "1.25rem" }}>
            <button onClick={() => scroll("prev")} aria-label="Previous"
              style={{ width: "38px", height: "38px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "#fff", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ←
            </button>
            <button onClick={() => scroll("next")} aria-label="Next"
              style={{ width: "38px", height: "38px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "#fff", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
              →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, onGetStarted, mobile }: { plan: typeof plans[0]; onGetStarted: () => void; mobile?: boolean }) {
  return (
    <div className="relative flex flex-col"
      style={{
        background: "var(--cs-charcoal)",
        border: plan.featured ? `1px solid ${plan.color}` : "1px solid rgba(255,255,255,0.06)",
        borderRadius: "4px",
        padding: "2rem",
        transition: "transform 0.2s",
        ...(mobile ? { minWidth: "78vw", maxWidth: "78vw", scrollSnapAlign: "start", flexShrink: 0 } : {}),
      }}
      onMouseEnter={(e) => { if (!mobile) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-6px)"; }}
      onMouseLeave={(e) => { if (!mobile) (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}>
      {plan.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 text-xs font-medium tracking-widest uppercase rounded-sm"
          style={{ background: plan.color, color: "var(--cs-black)" }}>
          Most popular
        </div>
      )}
      <div className="mb-6">
        <div className="text-xs tracking-widest uppercase mb-2" style={{ color: plan.color }}>{plan.tier}</div>
        <div className="font-display mb-1" style={{ fontSize: "clamp(2rem, 3vw, 2.8rem)", fontWeight: 300, color: "var(--cs-white)", lineHeight: 1.1 }}>
          {plan.title}
        </div>
        <div className="text-xs tracking-wide uppercase" style={{ color: "var(--cs-muted)" }}>{plan.duration} programme</div>
      </div>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--cs-muted)" }}>{plan.desc}</p>
      <ul className="flex flex-col gap-3 mb-8 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-3 text-sm" style={{ color: "var(--cs-white)" }}>
            <span className="w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center"
              style={{ background: `${plan.color}22`, border: `1px solid ${plan.color}` }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3.5 6L6.5 2" stroke={plan.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            {f}
          </li>
        ))}
      </ul>
      <button onClick={onGetStarted} className="btn-primary text-center justify-center"
        style={{
          background: plan.featured ? plan.color : "transparent",
          border: `1px solid ${plan.color}`,
          color: plan.featured ? "var(--cs-black)" : plan.color,
          cursor: "pointer",
          width: "100%",
        }}>
        Get started
      </button>
    </div>
  );
}
