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
                  style={{ display: "block", padding: "14px", background: "rgba(37,211,102,0.12)", color: "#4ade80", border: "1px solid rgba(37,211,102,0.3)", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>
                  💬 Ask a coach on WhatsApp first
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
