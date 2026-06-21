"use client";

import { useEffect, useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Session { type: string; detail: string; emoji: string; }
type Week = Session[];

const STATIC_PLANS: Record<string, Week> = {
  "5k": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "3 km at easy pace",      emoji: "🏃" },
    { type: "Cross Train", detail: "30 min walk or yoga",    emoji: "🧘" },
    { type: "Intervals",   detail: "4 × 400m / 90s rest",   emoji: "⚡" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "4 km easy",              emoji: "🏃" },
    { type: "Long Run",    detail: "5 km steady pace",       emoji: "🎯" },
  ],
  "10k": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "5 km at easy pace",      emoji: "🏃" },
    { type: "Tempo Run",   detail: "4 km at tempo pace",     emoji: "🔥" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Intervals",   detail: "6 × 400m / 90s rest",   emoji: "⚡" },
    { type: "Easy Run",    detail: "6 km easy",              emoji: "🏃" },
    { type: "Long Run",    detail: "8 km steady pace",       emoji: "🎯" },
  ],
  "half": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "8 km at easy pace",      emoji: "🏃" },
    { type: "Tempo Run",   detail: "6 km at tempo pace",     emoji: "🔥" },
    { type: "Easy Run",    detail: "6 km easy",              emoji: "🏃" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Intervals",   detail: "8 × 400m / 2m rest",    emoji: "⚡" },
    { type: "Long Run",    detail: "14 km steady pace",      emoji: "🎯" },
  ],
  "full": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "10 km at easy pace",     emoji: "🏃" },
    { type: "Tempo Run",   detail: "8 km at tempo pace",     emoji: "🔥" },
    { type: "Easy Run",    detail: "8 km easy",              emoji: "🏃" },
    { type: "Strength",    detail: "Cross train + core",     emoji: "💪" },
    { type: "Medium Run",  detail: "14 km steady pace",      emoji: "🏃" },
    { type: "Long Run",    detail: "22 km easy pace",        emoji: "🎯" },
  ],
  "ultra": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "12 km at easy pace",     emoji: "🏃" },
    { type: "Tempo Run",   detail: "10 km at tempo pace",    emoji: "🔥" },
    { type: "Easy Run",    detail: "10 km easy",             emoji: "🏃" },
    { type: "Strength",    detail: "Cross train + strength", emoji: "💪" },
    { type: "Medium Run",  detail: "20 km steady pace",      emoji: "🏃" },
    { type: "Long Run",    detail: "35 km easy pace",        emoji: "🎯" },
  ],
  "fitness": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "3 km easy jog",          emoji: "🏃" },
    { type: "Walk",        detail: "45 min brisk walk",      emoji: "🚶" },
    { type: "Cross Train", detail: "30 min yoga or swim",    emoji: "🧘" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "4 km easy",              emoji: "🏃" },
    { type: "Long Walk",   detail: "60 min active recovery", emoji: "🎯" },
  ],
  "weight": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Run + Walk",  detail: "20 min intervals",       emoji: "🏃" },
    { type: "Strength",    detail: "Bodyweight circuits",    emoji: "💪" },
    { type: "Easy Run",    detail: "3 km easy pace",         emoji: "🏃" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Cross Train", detail: "Cycle or swim 30 min",   emoji: "🚴" },
    { type: "Group Run",   detail: "5 km with community",    emoji: "👥" },
  ],
  "strength": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "4 km easy pace",         emoji: "🏃" },
    { type: "Strength",    detail: "Leg day + core",         emoji: "💪" },
    { type: "Cross Train", detail: "Yoga or mobility",       emoji: "🧘" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Tempo Run",   detail: "5 km moderate pace",     emoji: "🔥" },
    { type: "Long Run",    detail: "8 km easy",              emoji: "🎯" },
  ],
  "speed": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Strides",     detail: "6 × 100m strides",      emoji: "💨" },
    { type: "Tempo Run",   detail: "5 km at race pace",      emoji: "🔥" },
    { type: "Easy Run",    detail: "5 km easy",              emoji: "🏃" },
    { type: "Intervals",   detail: "10 × 200m / 60s rest",  emoji: "⚡" },
    { type: "Easy Run",    detail: "4 km easy",              emoji: "🏃" },
    { type: "Race Sim",    detail: "5 km time trial",        emoji: "🏁" },
  ],
};

const FALLBACK: Week = [
  { type: "Rest",     detail: "Recovery day",        emoji: "😴" },
  { type: "Easy Run", detail: "4 km at easy pace",   emoji: "🏃" },
  { type: "Cross",    detail: "30 min yoga or walk", emoji: "🧘" },
  { type: "Easy Run", detail: "4 km easy",           emoji: "🏃" },
  { type: "Rest",     detail: "Recovery day",        emoji: "😴" },
  { type: "Easy Run", detail: "5 km easy",           emoji: "🏃" },
  { type: "Long Run", detail: "6 km steady pace",    emoji: "🎯" },
];

const GOAL_LABELS: Record<string, string> = {
  "5k": "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "fitness": "General Fitness", "weight": "Weight Loss", "strength": "Strength", "speed": "Speed",
};

function getIntensity(type: string): { label: string; color: string; bg: string } {
  const hard = ["Intervals", "Tempo Run", "Race Sim", "Strides"];
  const moderate = ["Long Run", "Medium Run", "Group Run", "Run + Walk"];
  const rest = ["Rest"];
  if (rest.includes(type))     return { label: "Rest",     color: "var(--muted-foreground)", bg: "rgba(255,255,255,0.05)" };
  if (hard.includes(type))     return { label: "Hard",     color: "#ef4444",                 bg: "rgba(239,68,68,0.1)"    };
  if (moderate.includes(type)) return { label: "Moderate", color: "#e8620a",                 bg: "rgba(232,98,10,0.1)"    };
  return                              { label: "Light",    color: "#4ade80",                 bg: "rgba(74,222,128,0.1)"   };
}

interface Props { goal: string; email?: string; isActiveMember?: boolean | null; }

export default function TrainingPlan({ goal, email, isActiveMember }: Props) {
  const [plan,      setPlan]      = useState<Week | null>(null);
  const [planTitle, setPlanTitle] = useState<string | null>(null);
  const [coach,     setCoach]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(!!email);
  const [noPlan,    setNoPlan]    = useState(false);

  useEffect(() => {
    if (!email || !isActiveMember) { setLoading(false); return; }
    const token = typeof window !== "undefined" ? localStorage.getItem("cs_user_token") : null;
    fetch(`/api/user/training-plan?email=${encodeURIComponent(email)}`, {
      headers: token ? { "x-user-token": token } : {},
    })
      .then(r => r.json())
      .then(d => {
        if (d.plan?.days?.length === 7) {
          setPlan(d.plan.days);
          setPlanTitle(d.plan.title ?? null);
          setCoach(d.plan.coach_name ?? null);
        } else {
          setNoPlan(true);
        }
      })
      .catch(() => { setNoPlan(true); })
      .finally(() => setLoading(false));
  }, [email, isActiveMember]);

  const todayIdx = (new Date().getDay() + 6) % 7;

  if (loading || isActiveMember === null) return (
    <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "1.25rem", marginBottom: "0.75rem", minHeight: 100, opacity: 0.5 }} />
  );

  // Free users — show upgrade CTA, never show plan content
  if (!isActiveMember) return (
    <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "1.5rem", marginBottom: "0.75rem", textAlign: "center" }}>
      <div className="cs-label" style={{ marginBottom: 12 }}>Weekly Plan</div>
      <div style={{ fontSize: "1.75rem", marginBottom: 8 }}>🔒</div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)", marginBottom: 8 }}>Unlock Your Training Plan</div>
      <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.7, marginBottom: 16 }}>
        ✓ Personalized weekly plan<br />
        ✓ Coach guidance<br />
        ✓ Progress tracking
      </div>
      <a href="/pricing" style={{ display: "inline-block", padding: "9px 24px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 999, fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
        Upgrade →
      </a>
    </div>
  );

  // Premium user — no plan assigned yet
  if (noPlan && !plan) return (
    <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "1.5rem", marginBottom: "0.75rem" }}>
      <div className="cs-label" style={{ marginBottom: 12 }}>Weekly Plan</div>
      <div style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", lineHeight: 1.6, textAlign: "center", padding: "0.5rem 0" }}>
        No training plan assigned yet.<br />
        <span style={{ color: "var(--foreground)", fontWeight: 500 }}>Your coach will assign one shortly.</span>
      </div>
    </div>
  );

  const activePlan = plan!;
  const isCustom   = true;

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem", padding: "0 0.25rem" }}>
        <div>
          <div className="cs-label" style={{ marginBottom: 4 }}>Weekly Plan</div>
          {isCustom && (coach || planTitle) && (
            <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
              {coach && `By ${coach}`}{coach && planTitle && " · "}{planTitle}
            </div>
          )}
        </div>
        <span style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.06em", background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.2)", padding: "2px 8px", borderRadius: 999 }}>
          Custom
        </span>
      </div>

      {/* Premium users with assigned plan — show coach/title info */}
      {isCustom && (coach || planTitle) && (
        <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "0.75rem", padding: "0 0.25rem" }}>
          {coach && `By ${coach}`}{coach && planTitle && " · "}{planTitle}
        </div>
      )}

      {/* Day cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        {DAYS.map((day, i) => {
          const s       = activePlan[i];
          const isToday = i === todayIdx;
          const isRest  = s.type === "Rest";
          const intens  = getIntensity(s.type);

          return (
            <div key={day} style={{
              display: "flex", alignItems: "center", gap: "0.875rem",
              padding: isToday ? "0.875rem 1rem" : "0.65rem 1rem",
              borderRadius: 12,
              background: isToday ? "var(--surface)" : "transparent",
              border: isToday ? "1px solid rgba(232,98,10,0.25)" : "1px solid transparent",
              transition: "background 0.12s",
            }}>
              {/* Day label */}
              <div style={{ width: 28, flexShrink: 0, textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: isToday ? 800 : 500, color: isToday ? "var(--cs-orange)" : "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{day}</div>
                {isToday && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--cs-orange)", margin: "3px auto 0" }} />}
              </div>

              {/* Emoji */}
              <div style={{
                width: isToday ? 36 : 28, height: isToday ? 36 : 28, flexShrink: 0,
                borderRadius: isToday ? 10 : 8,
                background: isToday ? intens.bg : "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: isToday ? "1.1rem" : "0.9rem",
                transition: "all 0.12s",
              }}>
                {s.emoji}
              </div>

              {/* Type + detail */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: isToday ? "0.9rem" : "0.82rem", fontWeight: isToday ? 700 : 500, color: isRest ? "var(--muted-foreground)" : "var(--foreground)", lineHeight: 1.2 }}>
                  {s.type}
                </div>
                {isToday && (
                  <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 2 }}>{s.detail}</div>
                )}
              </div>

              {/* Intensity pill */}
              <div style={{ flexShrink: 0, fontSize: "9px", fontWeight: 700, color: intens.color, background: intens.bg, border: `1px solid ${intens.color}25`, padding: "2px 8px", borderRadius: 999, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {intens.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
