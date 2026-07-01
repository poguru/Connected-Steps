"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Shield, Zap, Users } from "lucide-react";

const TRUST_ITEMS = [
  { icon: <Zap size={13} />, label: "Free account · No card needed" },
  { icon: <Shield size={13} />, label: "Cancel anytime" },
  { icon: <Users size={13} />, label: "500+ runners already inside" },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.querySelectorAll(".cs-reveal,.cs-reveal-s").forEach(e => e.classList.add("cs-vis"));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add("cs-vis"); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.1 });
    el.querySelectorAll(".cs-reveal,.cs-reveal-s").forEach(e => obs.observe(e));
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function FinalCTA() {
  const ref = useReveal();
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => { setLoggedIn(!!localStorage.getItem("cs_user")); }, []);

  return (
    <section
      ref={ref}
      style={{
        padding: "clamp(4rem, 10vh, 7rem) 0",
        background: "var(--background)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="container">
        <div
          className="cs-reveal"
          style={{
            position: "relative",
            borderRadius: 24,
            overflow: "hidden",
            padding: "clamp(2.5rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 4rem)",
            textAlign: "center",
            background: "linear-gradient(160deg, oklch(0.18 0.025 40) 0%, oklch(0.15 0.010 250) 50%, oklch(0.18 0.015 270) 100%)",
            border: "1px solid oklch(0.72 0.19 49 / 20%)",
            boxShadow: "inset 0 1px 0 oklch(0.72 0.19 49 / 15%), 0 40px 100px rgba(0,0,0,0.5)",
          }}
        >
          {/* Background glows */}
          <div style={{
            position: "absolute", top: "-50%", left: "50%", transform: "translateX(-50%)",
            width: "80%", height: "200%",
            background: "radial-gradient(ellipse at 50% 0%, oklch(0.72 0.19 49 / 18%) 0%, transparent 60%)",
            pointerEvents: "none",
          }} aria-hidden />
          <div style={{
            position: "absolute", bottom: -80, right: -80,
            width: 320, height: 320, borderRadius: "50%",
            background: "radial-gradient(circle, oklch(0.66 0.22 30 / 12%) 0%, transparent 70%)",
            pointerEvents: "none",
          }} aria-hidden />

          {/* Content */}
          <div style={{ position: "relative", zIndex: 1 }}>

            <div className="cs-reveal cs-section-badge" style={{ margin: "0 auto 1.5rem", width: "fit-content" }}>
              Join Connected Steps
            </div>

            <h2
              className="cs-reveal cs-d1 font-display"
              style={{
                fontSize: "clamp(2.2rem, 5.5vw, 4.5rem)",
                fontWeight: 300,
                lineHeight: 1.05,
                color: "var(--foreground)",
                marginBottom: "1.25rem",
                letterSpacing: "-0.02em",
              }}
            >
              Your goal is waiting.{" "}
              <br className="hidden sm:block" />
              <em style={{
                fontStyle: "normal",
                background: "linear-gradient(135deg, oklch(0.82 0.19 55) 0%, oklch(0.68 0.22 30) 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              }}>
                We have the plan.
              </em>
            </h2>

            <p
              className="cs-reveal cs-d2"
              style={{
                fontSize: "clamp(1rem, 1.8vw, 1.15rem)",
                color: "var(--muted-foreground)",
                maxWidth: 480,
                margin: "0 auto 2.5rem",
                lineHeight: 1.7,
              }}
            >
              Create your free account in 60 seconds. Browse sessions,
              preview your training plan, and run with us — before you spend a rupee.
            </p>

            {/* CTAs */}
            <div
              className="cs-reveal cs-d3"
              style={{
                display: "flex", flexWrap: "wrap" as const, justifyContent: "center", gap: "0.875rem",
                marginBottom: "2rem",
              }}
            >
              <Link href={loggedIn ? "/dashboard" : "/auth?tab=register"} className="cs-final-cta-primary">
                {loggedIn ? "Go to Dashboard" : "Join free — start running"}
                <ArrowRight size={17} />
              </Link>

              <Link href="/pricing" className="cs-final-cta-secondary">
                View pricing
              </Link>
            </div>

            {/* Trust strip */}
            <div
              className="cs-reveal cs-d4"
              style={{
                display: "flex", flexWrap: "wrap" as const, justifyContent: "center", gap: "1.25rem",
              }}
            >
              {TRUST_ITEMS.map(item => (
                <div
                  key={item.label}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: "0.78rem", color: "var(--muted-foreground)",
                  }}
                >
                  <span style={{ color: "var(--cs-orange)", opacity: 0.8 }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
