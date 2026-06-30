"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Building2 } from "lucide-react";
import { Label } from "@/components/ui/ds";

const benefits = [
  "Employee engagement",
  "Wellness challenges",
  "Team building events",
  "Health tracking dashboards",
];

export default function CallToAction() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => { setLoggedIn(!!localStorage.getItem("cs_user")); }, []);

  return (
    <>
      {/* Corporate Wellness */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "5rem 1.5rem" }}>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 24, background: "var(--gradient-primary)", padding: "3rem 2rem", color: "#fff", boxShadow: "var(--shadow-glow)" }} className="md:p-14">
          <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.2 }} />
          <div style={{ position: "absolute", top: -80, right: -80, width: 288, height: 288, borderRadius: "50%", background: "oklch(0.74 0.2 50 / 30%)", filter: "blur(48px)" }} />
          <div style={{ position: "relative", display: "grid", gap: "3rem" }} className="lg:grid-cols-2 lg:items-center">
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, background: "rgba(255,255,255,0.15)", padding: "4px 12px", fontSize: 12, fontWeight: 500, backdropFilter: "blur(8px)", marginBottom: "1.25rem" }}>
                <Building2 size={14} /> Corporate Wellness
              </div>
              <h2 className="font-display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 700, lineHeight: 1.15, marginBottom: "1rem" }}>
                Build a fitter, happier <span className="text-italic-serif">team</span>.
              </h2>
              <p style={{ maxWidth: 480, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, marginBottom: "2rem" }}>
                Wellness programs, team challenges, and group runs designed for companies that care about their people.
              </p>
              <div style={{ display: "grid", gap: "0.75rem", marginBottom: "2.25rem" }} className="sm:grid-cols-2">
                {benefits.map(b => (
                  <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.875rem" }}>
                    <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2, color: "var(--accent)" }} />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
              <a href="mailto:corporate@connectedsteps.in" className="cs-cta-btn-primary">
                Book a Consultation <ArrowRight size={16} />
              </a>
              <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                {[
                  { icon: "📩", text: "Free consultation" },
                  { icon: "📊", text: "Custom pricing" },
                  { icon: "🏃", text: "Flexible programme length" },
                ].map(t => (
                  <span key={t.text} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.75)", background: "rgba(255,255,255,0.1)", borderRadius: 20, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
                    {t.icon} {t.text}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gap: "1rem" }} className="sm:grid-cols-2">
              {[
                { num: "80+",  label: "Companies served" },
                { num: "95%",  label: "Participant satisfaction" },
                { num: "6 wk", label: "Average programme length" },
                { num: "40%",  label: "Avg activity increase" },
              ].map(s => (
                <div key={s.label} style={{ borderRadius: 16, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", padding: "1.25rem", backdropFilter: "blur(8px)" }}>
                  <div className="font-display" style={{ fontSize: "2rem", fontWeight: 700 }}>{s.num}</div>
                  <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ background: "var(--gradient-soft)", padding: "5rem 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 1.5rem", textAlign: "center" }}>
          <div>
            <Label style={{ color: "var(--primary)", marginBottom: "1rem" }}>Join Connected Steps</Label>
            <h2 className="font-display" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 700, letterSpacing: "-0.015em", color: "var(--foreground)", marginBottom: "1.25rem" }}>
              Your goal is waiting.{" "}
              <span className="text-gradient-accent">We have the plan.</span>
            </h2>
            <p style={{ fontSize: "1.1rem", color: "var(--muted-foreground)", maxWidth: 480, margin: "0 auto 2.5rem", lineHeight: 1.7 }}>
              Create your free account in 60 seconds. Browse sessions, see your plan preview, and join the community — before you spend a rupee.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.75rem" }}>
              <Link href={loggedIn ? "/dashboard" : "/auth?tab=register"} className="cs-cta-btn-primary cs-cta-btn-lg">
                {loggedIn ? "Go to Dashboard" : "Join free — start running"} <ArrowRight size={18} />
              </Link>
              <Link href="/pricing" className="cs-cta-btn-secondary cs-cta-btn-lg">
                View pricing
              </Link>
            </div>
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
              Free account · No credit card needed · Cancel anytime
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
