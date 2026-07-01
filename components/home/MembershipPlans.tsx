"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ArrowRight, Zap } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    badge: null,
    price: "₹0",
    period: "forever",
    description: "Explore the community before you commit.",
    cta: "Get Started",
    href: "/auth?tab=register",
    featured: false,
    features: [
      "Browse all upcoming sessions",
      "See sample training plans",
      "Join community discussions",
      "Access leaderboard",
      "Mobile app access",
    ],
  },
  {
    name: "Member",
    badge: "Most Popular",
    price: "₹1,499",
    period: "per month",
    description: "Full access to group runs, coaching and structured training.",
    cta: "Start Training",
    href: "/pricing",
    featured: true,
    features: [
      "Attend unlimited group sessions",
      "Structured weekly training plan",
      "NIS-certified coach support",
      "Race-day guidance",
      "WhatsApp coaching group",
      "Priority session registration",
    ],
  },
  {
    name: "Pro",
    badge: "Best Value",
    price: "₹2,499",
    period: "per month",
    description: "Personalised coaching with 1:1 attention for serious athletes.",
    cta: "Go Pro",
    href: "/pricing",
    featured: false,
    features: [
      "Everything in Member",
      "Personalised training plan",
      "1:1 coach calls (2x/month)",
      "Video form analysis",
      "Nutrition guidance",
      "Priority event registration",
    ],
  },
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
    }, { threshold: 0.08 });
    el.querySelectorAll(".cs-reveal,.cs-reveal-s").forEach(e => obs.observe(e));
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function MembershipPlans() {
  const ref = useReveal();
  const [annual, setAnnual] = useState(false);

  return (
    <section
      ref={ref}
      id="pricing"
      style={{
        padding: "clamp(4rem, 10vh, 7rem) 0",
        background: "var(--background)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background accent */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 50% at 50% 100%, oklch(0.72 0.19 49 / 6%) 0%, transparent 70%)",
      }} aria-hidden />

      <div className="container" style={{ position: "relative" }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div className="cs-reveal cs-section-badge" style={{ width: "fit-content", margin: "0 auto 1.25rem" }}>
            Membership Plans
          </div>
          <h2
            className="cs-reveal cs-d1 font-display"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
              fontWeight: 300, color: "var(--foreground)", lineHeight: 1.1, marginBottom: "1rem",
            }}
          >
            Invest in your{" "}
            <em style={{
              fontStyle: "normal",
              background: "linear-gradient(135deg, oklch(0.78 0.18 55), oklch(0.68 0.22 30))",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>
              running.
            </em>
          </h2>
          <p className="cs-reveal cs-d2" style={{
            fontSize: "1rem", color: "var(--muted-foreground)", maxWidth: 440, margin: "0 auto 2rem",
          }}>
            Start free. Upgrade when you&apos;re ready. Cancel anytime.
          </p>

          {/* Annual toggle */}
          <div className="cs-reveal cs-d2" style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "4px 6px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "var(--surface)",
          }}>
            <button
              onClick={() => setAnnual(false)}
              style={{
                padding: "7px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: "0.82rem", fontWeight: 600,
                background: !annual ? "var(--gradient-accent)" : "transparent",
                color: !annual ? "#fff" : "var(--muted-foreground)",
                transition: "all 0.2s",
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              style={{
                padding: "7px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: "0.82rem", fontWeight: 600,
                background: annual ? "var(--gradient-accent)" : "transparent",
                color: annual ? "#fff" : "var(--muted-foreground)",
                transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              Annual
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                background: "rgba(74,222,128,0.15)", color: "#4ade80",
                border: "1px solid rgba(74,222,128,0.3)", borderRadius: 999, padding: "1px 6px",
              }}>
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* ── Cards ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(1, 1fr)",
          gap: "1.25rem",
        }}
          className="md:grid-cols-3"
        >
          {PLANS.map((plan, i) => (
            <div
              key={plan.name}
              className={`cs-plan-card ${plan.featured ? "cs-plan-featured" : ""} cs-reveal cs-d${i + 1}`}
            >
              {/* Featured glow */}
              {plan.featured && (
                <div style={{
                  position: "absolute", inset: -1, borderRadius: 21, pointerEvents: "none",
                  background: "linear-gradient(135deg, oklch(0.72 0.19 49 / 20%), transparent 60%)",
                  zIndex: 0,
                }} aria-hidden />
              )}

              <div style={{ position: "relative", zIndex: 1 }}>
                {/* Plan header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: "1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "0.25rem" }}>
                      {plan.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{
                        fontSize: plan.price === "₹0" ? "2rem" : "2.25rem",
                        fontWeight: 900,
                        color: plan.featured ? "var(--cs-orange)" : "var(--foreground)",
                        fontFamily: "var(--font-body), sans-serif",
                        lineHeight: 1,
                      }}>
                        {annual && plan.price !== "₹0"
                          ? `₹${(parseInt(plan.price.replace("₹", "").replace(",", "")) * 0.8 * 12).toLocaleString("en-IN")}`
                          : plan.price}
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
                        {annual && plan.price !== "₹0" ? "/year" : `/${plan.period}`}
                      </span>
                    </div>
                  </div>
                  {plan.badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      padding: "3px 10px", borderRadius: 999,
                      background: plan.featured ? "var(--gradient-accent)" : "rgba(74,222,128,0.12)",
                      color: plan.featured ? "#fff" : "#4ade80",
                      border: plan.featured ? "none" : "1px solid rgba(74,222,128,0.3)",
                      flexShrink: 0,
                    }}>
                      {plan.badge}
                    </span>
                  )}
                </div>

                <p style={{
                  fontSize: "0.82rem", color: "var(--muted-foreground)",
                  marginBottom: "1.5rem", lineHeight: 1.55,
                }}>
                  {plan.description}
                </p>

                {/* Features */}
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.75rem", display: "flex", flexDirection: "column" as const, gap: "0.6rem" }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
                      <Check size={14} style={{ color: plan.featured ? "var(--cs-orange)" : "#4ade80", marginTop: 2, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={plan.href}
                  className={plan.featured ? "cs-hero-cta-primary" : "cs-hero-cta-secondary"}
                  style={{ justifyContent: "center", width: "100%", padding: "12px 20px", fontSize: "0.875rem" }}
                >
                  {plan.featured && <Zap size={14} />}
                  {plan.cta}
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <p className="cs-reveal" style={{
          textAlign: "center", marginTop: "2rem",
          fontSize: "0.78rem", color: "var(--muted-foreground)",
        }}>
          All plans include community access · No hidden fees · Cancel anytime
        </p>

      </div>
    </section>
  );
}
