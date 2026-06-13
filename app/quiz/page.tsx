"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const steps = [
  {
    id: "goal",
    question: "What's your running goal?",
    options: [
      { label: "Run my first 5K",        emoji: "🏃", value: "5k" },
      { label: "Complete a 10K",          emoji: "🎯", value: "10k" },
      { label: "Finish a Half Marathon",  emoji: "🏅", value: "half" },
      { label: "Run a Full Marathon",     emoji: "🏆", value: "full" },
      { label: "Lose weight & get fit",   emoji: "💪", value: "wellness" },
      { label: "Build strength & endurance", emoji: "⚡", value: "strength" },
    ],
  },
  {
    id: "level",
    question: "What's your current fitness level?",
    options: [
      { label: "Complete beginner",           emoji: "🌱", value: "beginner" },
      { label: "I run occasionally",          emoji: "🚶", value: "occasional" },
      { label: "I run 2–3 times a week",      emoji: "🏃", value: "regular" },
      { label: "I train seriously",           emoji: "🔥", value: "advanced" },
    ],
  },
  {
    id: "timeline",
    question: "When do you want to achieve your goal?",
    options: [
      { label: "As soon as possible",   emoji: "⚡", value: "asap" },
      { label: "In 2–3 months",         emoji: "📅", value: "2-3months" },
      { label: "In 4–6 months",         emoji: "🗓️", value: "4-6months" },
      { label: "I'm not in a hurry",    emoji: "🌿", value: "flexible" },
    ],
  },
];

const planRecommendations: Record<string, { plan: string; duration: string; price: string; description: string }> = {
  "5k":       { plan: "Starter",       duration: "8 weeks",  price: "₹1,200/mo", description: "Walk-run intervals, weekly coach check-in, and a Hyderabad 5K finish in 8 weeks." },
  "10k":      { plan: "Intermediate",  duration: "10 weeks", price: "₹1,200/mo", description: "Interval training, tempo runs, and race strategy — built around your 10K goal." },
  "half":     { plan: "Builder",       duration: "14 weeks", price: "₹1,200/mo", description: "Our most popular plan. Bi-weekly coaching, long runs, and a complete race day strategy." },
  "full":     { plan: "Elite",         duration: "20 weeks", price: "₹1,200/mo", description: "Weekly 1-on-1 coaching, GPS pace targets, strength work, and full marathon preparation." },
  "wellness": { plan: "Wellness",      duration: "8 weeks",  price: "₹1,200/mo", description: "Cardio-focused training, nutrition guidance, and progress tracking — built to keep the weight off." },
  "strength": { plan: "Power",         duration: "10 weeks", price: "₹1,200/mo", description: "Progressive overload, core stability, and injury prevention — for runners who want to get stronger." },
};

export default function QuizPage() {
  const [current,  setCurrent]  = useState(0);
  const [answers,  setAnswers]  = useState<Record<string, string>>({});
  const [done,     setDone]     = useState(false);

  function pick(value: string) {
    const step = steps[current];
    const next = { ...answers, [step.id]: value };
    setAnswers(next);
    if (current < steps.length - 1) {
      setCurrent(current + 1);
    } else {
      setDone(true);
    }
  }

  const rec = planRecommendations[answers.goal ?? "5k"];
  const progress = Math.round(((current) / steps.length) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ padding: "1.25rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem" }}>
        <div style={{ width: "100%", maxWidth: "560px" }}>

          {!done ? (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: "2.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "11px", color: "var(--cs-muted)" }}>
                  <span>Step {current + 1} of {steps.length}</span>
                  <span>{progress}% complete</span>
                </div>
                <div style={{ height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: "var(--cs-orange)", borderRadius: "4px", transition: "width 0.3s" }} />
                </div>
              </div>

              <h1 style={{ fontSize: "clamp(1.4rem, 4vw, 2rem)", fontWeight: 300, color: "var(--cs-white)", marginBottom: "2rem", lineHeight: 1.3 }}>
                {steps[current].question}
              </h1>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "0.75rem" }}>
                {steps[current].options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => pick(opt.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "1rem 1.25rem",
                      background: "var(--cs-dark)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      color: "var(--cs-white)",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      textAlign: "left",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cs-orange)"; e.currentTarget.style.background = "rgba(232,98,10,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "var(--cs-dark)"; }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Result */
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
              <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem", fontWeight: 600 }}>
                Your Recommended Plan
              </div>
              <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 300, color: "var(--cs-white)", marginBottom: "1.5rem" }}>
                The <em style={{ color: "var(--cs-orange)", fontStyle: "normal" }}>{rec?.plan}</em> Plan
              </h1>

              <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: "12px", padding: "1.75rem", marginBottom: "2rem", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>⏱ Duration: <strong style={{ color: "var(--cs-white)" }}>{rec?.duration}</strong></span>
                  <span style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>💳 From: <strong style={{ color: "var(--cs-orange)" }}>{rec?.price}</strong></span>
                </div>
                <p style={{ fontSize: "0.9rem", color: "var(--cs-muted)", lineHeight: 1.7, margin: 0 }}>{rec?.description}</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <Link href="/pricing" style={{ display: "block", padding: "14px", background: "var(--cs-orange)", color: "#fff", borderRadius: "8px", textDecoration: "none", fontWeight: 700, fontSize: "0.95rem" }}>
                  View pricing & join →
                </Link>
                <a href="https://wa.me/9703620570?text=Hi%2C%20I%20completed%20the%20quiz%20and%20want%20to%20know%20more%20about%20the%20{rec?.plan}%20plan!" target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "14px", background: "var(--surface)", color: "var(--muted-foreground)", border: "1px solid var(--border)", borderRadius: "8px", textDecoration: "none", fontWeight: 500, fontSize: "0.875rem", transition: "border-color 0.2s, color 0.2s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "oklch(0.72 0.19 49 / 40%)"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--foreground)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--muted-foreground)"; }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink: 0 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.122 1.528 5.855L.057 23.882a.5.5 0 00.61.61l6.086-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.51-5.25-1.4l-.38-.22-3.9.94.97-3.82-.25-.4A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                  Ask a coach on WhatsApp
                </a>
                <button onClick={() => { setCurrent(0); setAnswers({}); setDone(false); }}
                  style={{ background: "none", border: "none", color: "var(--cs-muted)", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit", padding: "0.5rem" }}>
                  ← Retake quiz
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
