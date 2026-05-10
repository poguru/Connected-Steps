"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const MONTHLY_RATE = 1200;

const plans = [
  {
    id:       "monthly",
    label:    "Monthly",
    months:   1,
    payFor:   1,
    badge:    null,
    popular:  false,
  },
  {
    id:       "quarterly",
    label:    "3 Months",
    months:   3,
    payFor:   2.5,
    badge:    "Save ₹600",
    popular:  false,
  },
  {
    id:       "biannual",
    label:    "6 Months",
    months:   6,
    payFor:   5,
    badge:    "Save ₹1,200",
    popular:  true,
  },
  {
    id:       "annual",
    label:    "12 Months",
    months:   12,
    payFor:   9,
    badge:    "Best Value",
    popular:  false,
  },
];

const features = [
  "Personalised training plan",
  "Weekly coach check-in",
  "Real-time analytics dashboard",
  "Strava & Garmin sync",
  "Community & group challenges",
  "Weekend special run access",
  "WhatsApp coach support",
];

export default function PricingPage() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)", fontFamily: "var(--font-display)" }}>Connected Steps</span>
        </Link>
        <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>← Back to home</Link>
      </header>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "7rem 1.5rem 5rem" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <div style={{ fontSize: "10px", color: "var(--cs-orange)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 600 }}>Pricing</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 300, color: "var(--cs-white)", marginBottom: "1rem", lineHeight: 1.1 }}>
            Simple, honest pricing.<br />
            <em style={{ color: "var(--cs-orange)", fontStyle: "normal" }}>Longer you commit, more you save.</em>
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--cs-muted)", maxWidth: "480px", margin: "0 auto", lineHeight: 1.7 }}>
            All plans include every feature — no tiers, no hidden fees.<br />
            All prices inclusive of GST.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: "1.25rem", alignItems: "start" }}>
          {plans.map((plan) => {
            const total      = Math.round(plan.payFor * MONTHLY_RATE);
            const perMonth   = Math.round(total / plan.months);
            const saving     = Math.round((plan.months - plan.payFor) * MONTHLY_RATE);
            const isHovered  = hovered === plan.id;
            const isPopular  = plan.popular;

            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHovered(plan.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: "relative",
                  background: isPopular ? "rgba(232,98,10,0.07)" : "var(--cs-dark)",
                  border: `1px solid ${isPopular || isHovered ? "rgba(232,98,10,0.5)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: "12px",
                  padding: "2rem 1.75rem",
                  transition: "border-color 0.2s, transform 0.2s",
                  transform: isPopular ? "scale(1.03)" : isHovered ? "translateY(-4px)" : "none",
                  cursor: "default",
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div style={{
                    position: "absolute",
                    top: "-12px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--cs-orange)",
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "4px 14px",
                    borderRadius: "20px",
                    whiteSpace: "nowrap",
                  }}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan label */}
                <div style={{ fontSize: "11px", color: isPopular ? "var(--cs-orange)" : "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "1.25rem" }}>
                  {plan.label}
                </div>

                {/* Price */}
                <div style={{ marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "2.8rem", fontWeight: 300, color: "var(--cs-white)", lineHeight: 1 }}>
                    ₹{perMonth.toLocaleString("en-IN")}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginLeft: "4px" }}>/mo</span>
                </div>

                {/* Total billed */}
                <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginBottom: saving > 0 ? "0.4rem" : "1.75rem" }}>
                  ₹{total.toLocaleString("en-IN")} billed {plan.months === 1 ? "monthly" : `every ${plan.months} months`}
                </div>

                {/* Saving line */}
                {saving > 0 && (
                  <div style={{ fontSize: "0.78rem", color: "#4ade80", fontWeight: 600, marginBottom: "1.75rem" }}>
                    You save ₹{saving.toLocaleString("en-IN")} ({plan.months - plan.payFor} {plan.months - plan.payFor === 1 ? "month" : `months`} free)
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: "1.5rem" }} />

                {/* Features */}
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "0.8rem", color: "var(--cs-muted)", lineHeight: 1.4 }}>
                      <svg style={{ flexShrink: 0, marginTop: "1px", color: "var(--cs-orange)" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href="/auth"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "12px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    letterSpacing: "0.04em",
                    background: isPopular ? "var(--cs-orange)" : "transparent",
                    color: isPopular ? "#fff" : "var(--cs-white)",
                    border: isPopular ? "none" : "1px solid rgba(255,255,255,0.2)",
                    transition: "background 0.2s, border-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isPopular) {
                      e.currentTarget.style.background = "rgba(232,98,10,0.15)";
                      e.currentTarget.style.borderColor = "var(--cs-orange)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isPopular) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                    }
                  }}
                >
                  Get started
                </Link>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p style={{ textAlign: "center", fontSize: "12px", color: "var(--cs-muted)", marginTop: "3rem", lineHeight: 1.7 }}>
          Not sure which plan to pick? <Link href="https://wa.me/9703620570" target="_blank" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Chat with us on WhatsApp</Link> — we'll help you choose.
        </p>
      </div>
    </div>
  );
}
