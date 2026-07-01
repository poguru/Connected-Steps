"use client";

import { useEffect, useRef, useState } from "react";

const FAQS = [
  {
    q: "Do I need to be fit to join Connected Steps?",
    a: "Absolutely not. We welcome complete beginners. Our coaches design programs specifically for people who have never run before. If you can walk, you can start with us.",
  },
  {
    q: "How are the weekly sessions structured?",
    a: "We run sessions every weekend morning (typically Saturday or Sunday, 5:30–7:30 AM) at various locations across Hyderabad. Sessions include warm-up, structured run, cool-down, and coach feedback. Mid-week virtual check-ins are included with paid plans.",
  },
  {
    q: "What does the free account include?",
    a: "Your free account lets you browse all upcoming sessions, see sample training plans, join community discussions and track your progress. You can attend your first session as a guest to experience the community before upgrading.",
  },
  {
    q: "How quickly can I expect to run a 5K?",
    a: "Most beginners complete their first 5K within 8–12 weeks of consistent training. With our structured program and coach accountability, many members have done it faster. Consistency is the key factor.",
  },
  {
    q: "Are the coaches NIS-certified?",
    a: "Yes. All Connected Steps head coaches hold NIS (National Institute of Sports) certifications. Our coaching team includes national-level athletes and marathon finishers with combined experience of 40+ years.",
  },
  {
    q: "What if I miss sessions due to work or travel?",
    a: "Life happens — our program is designed around it. Paid members get access to digital training plans they can follow independently, plus make-up session options. Your coach will also adapt your plan around your schedule.",
  },
  {
    q: "Do you train for specific races like Hyderabad Marathon?",
    a: "Yes. We build our annual calendar around major races including the Hyderabad Marathon, Airtel Delhi Marathon, and TATA Mumbai Marathon. Many of our members have completed these events with personal bests.",
  },
  {
    q: "Is there a corporate or group plan?",
    a: "Yes — we offer tailored wellness programs for companies. Reach out at corporate@connectedsteps.in for a custom quote based on your team size and goals.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="cs-faq-item">
      <button
        className="cs-faq-trigger"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className={`cs-faq-icon${open ? " open" : ""}`}>+</span>
      </button>
      <div className={`cs-faq-body${open ? " open" : ""}`}>
        <p style={{
          margin: 0,
          padding: "1rem 0 0.25rem",
          fontSize: "0.875rem",
          color: "var(--muted-foreground)",
          lineHeight: 1.75,
        }}>
          {a}
        </p>
      </div>
    </div>
  );
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.querySelectorAll(".cs-reveal,.cs-reveal-l,.cs-reveal-r").forEach(e => e.classList.add("cs-vis"));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add("cs-vis"); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.08 });
    el.querySelectorAll(".cs-reveal,.cs-reveal-l,.cs-reveal-r").forEach(e => obs.observe(e));
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function FAQ() {
  const ref = useReveal();

  return (
    <section
      ref={ref}
      id="faq"
      style={{
        padding: "clamp(4rem, 10vh, 7rem) 0",
        background: "var(--background)",
      }}
    >
      <div className="container">
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "3rem",
        }}
          className="lg:grid-cols-[2fr_3fr] lg:gap-16 lg:items-start"
        >

          {/* ── Left: Header (sticky on desktop) ── */}
          <div className="cs-reveal-l lg:sticky" style={{ top: "7rem" }}>
            <div className="cs-section-badge" style={{ marginBottom: "1.25rem" }}>
              FAQ
            </div>
            <h2 className="font-display" style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 300,
              color: "var(--foreground)",
              lineHeight: 1.1,
              marginBottom: "1rem",
            }}>
              Common{" "}
              <em style={{
                fontStyle: "normal",
                background: "linear-gradient(135deg, oklch(0.78 0.18 55), oklch(0.68 0.22 30))",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              }}>
                Questions
              </em>
            </h2>
            <p style={{
              fontSize: "0.9rem",
              color: "var(--muted-foreground)",
              lineHeight: 1.7,
              marginBottom: "1.5rem",
            }}>
              Can&apos;t find what you&apos;re looking for? Reach out directly.
            </p>
            <a
              href="mailto:info@connectedsteps.in"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: "0.85rem", fontWeight: 600,
                color: "var(--cs-orange)",
                textDecoration: "none",
                transition: "opacity 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.75"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            >
              info@connectedsteps.in →
            </a>
          </div>

          {/* ── Right: FAQ items ── */}
          <div className="cs-reveal cs-d1">
            {FAQS.map(faq => (
              <FAQItem key={faq.q} {...faq} />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
