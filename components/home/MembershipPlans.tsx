"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { MembershipPlan } from "@/app/api/membership-plans/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(plan: MembershipPlan): string | null {
  if (plan.is_contact_only || plan.price === null || plan.price === undefined) return null;
  return `₹${Number(plan.price).toLocaleString("en-IN")}`;
}

// ── Reveal hook ───────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function MembershipPlans() {
  const ref   = useReveal();
  const [plans,   setPlans]   = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/membership-plans")
      .then(r => r.json())
      .then(d => setPlans(d.plans ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section ref={ref} id="pricing" style={{ padding: "clamp(4rem, 10vh, 7rem) 0", background: "var(--background)", position: "relative", overflow: "hidden" }}>
      {/* Background accent */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 50% at 50% 100%, oklch(0.72 0.19 49 / 6%) 0%, transparent 70%)" }} aria-hidden />

      <div className="container" style={{ position: "relative" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div className="cs-reveal cs-section-badge" style={{ width: "fit-content", margin: "0 auto 1.25rem" }}>
            Membership Plans
          </div>
          <h2 className="cs-reveal cs-d1 font-display" style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", fontWeight: 300, color: "var(--foreground)", lineHeight: 1.1, marginBottom: "1rem" }}>
            Invest in your{" "}
            <em style={{ fontStyle: "normal", background: "linear-gradient(135deg, oklch(0.78 0.18 55), oklch(0.68 0.22 30))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              running.
            </em>
          </h2>
          <p className="cs-reveal cs-d2" style={{ fontSize: "1rem", color: "var(--muted-foreground)", maxWidth: 440, margin: "0 auto" }}>
            Start free. Upgrade when you&apos;re ready. Cancel anytime.
          </p>
        </div>

        {/* Cards */}
        {loading ? (
          // Skeleton
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "1.25rem" }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="cs-plan-card" style={{ height: 360, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "cs-shimmer 1.4s infinite" }} />
            ))}
          </div>
        ) : plans.length === 0 ? (
          // Fallback
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem" }}>
              Pricing plans are being configured.{" "}
              <Link href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-orange)" }}>Contact us</Link>{" "}
              for details.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "1.25rem" }}>
            {plans.map(plan => {
              const priceStr = fmtPrice(plan);
              const isContact = !priceStr;
              const isFeatured = plan.is_featured;

              return (
                <div
                  key={plan.id}
                  className={`cs-plan-card cs-reveal ${isFeatured ? "cs-plan-featured" : ""}`}
                  style={{ position: "relative" }}
                >
                  {/* Featured glow overlay */}
                  {isFeatured && (
                    <div style={{ position: "absolute", inset: -1, borderRadius: 21, pointerEvents: "none", background: "linear-gradient(135deg, oklch(0.72 0.19 49 / 20%), transparent 60%)", zIndex: 0 }} aria-hidden />
                  )}

                  <div style={{ position: "relative", zIndex: 1 }}>
                    {/* Badge */}
                    {plan.badge_label && (
                      <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "var(--cs-orange)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                        {plan.badge_label}
                      </div>
                    )}

                    {/* Name */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: isFeatured ? "var(--cs-orange)" : "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: "0.75rem" }}>
                      {plan.name}
                    </div>

                    {/* Price */}
                    <div style={{ marginBottom: "0.5rem" }}>
                      {isContact ? (
                        <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-body)" }}>Contact Us</span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 300, color: "var(--foreground)", lineHeight: 1 }}>{priceStr}</span>
                          {plan.billing_label && (
                            <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>/{plan.billing_label.replace("per ", "")}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {plan.description && (
                      <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
                        {plan.description}
                      </p>
                    )}

                    {/* Features */}
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.75rem", display: "flex", flexDirection: "column" as const, gap: "0.55rem", flex: 1 }}>
                      {(plan.features ?? []).map((f, i) => (
                        <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                          <svg width="13" height="13" viewBox="0 0 13 13" style={{ flexShrink: 0, marginTop: 2 }}>
                            <circle cx="6.5" cy="6.5" r="5.75" fill="rgba(232,98,10,0.12)" stroke="rgba(232,98,10,0.3)" strokeWidth="0.75" />
                            <polyline points="3.5,6.5 5.5,8.5 9.5,4" fill="none" stroke="var(--cs-orange)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    {plan.cta_href ? (
                      <a href={plan.cta_href} target="_blank" rel="noopener noreferrer"
                        className={isFeatured ? "cs-hero-cta-primary" : "cs-hero-cta-secondary"}
                        style={{ justifyContent: "center", width: "100%", padding: "12px 16px", fontSize: "0.875rem" }}>
                        {plan.cta_label} <ArrowRight size={14} />
                      </a>
                    ) : (
                      <Link href={`/pricing#${plan.slug}`}
                        className={isFeatured ? "cs-hero-cta-primary" : "cs-hero-cta-secondary"}
                        style={{ justifyContent: "center", width: "100%", padding: "12px 16px", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: 7 }}>
                        {plan.cta_label} <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        <p className="cs-reveal" style={{ textAlign: "center", marginTop: "2rem", fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
          All plans include community access · No hidden fees ·{" "}
          <Link href="/pricing" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>View full details →</Link>
        </p>

      </div>
    </section>
  );
}
