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
  // Goals not in original list — use sensible defaults
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

interface Props { goal: string; email?: string; }

export default function TrainingPlan({ goal, email }: Props) {
  const [plan,      setPlan]      = useState<Week | null>(null);
  const [planTitle, setPlanTitle] = useState<string | null>(null);
  const [coach,     setCoach]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(!!email);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    fetch(`/api/user/training-plan?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => {
        if (d.plan?.days?.length === 7) {
          setPlan(d.plan.days);
          setPlanTitle(d.plan.title ?? null);
          setCoach(d.plan.coach_name ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  const staticPlan = STATIC_PLANS[goal] ?? FALLBACK;
  const activePlan = plan ?? staticPlan;
  const isCustom   = !!plan;

  if (loading) return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", marginBottom: "0.75rem", minHeight: 100, opacity: 0.5 }} />
  );

  if (!activePlan) return null;

  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.875rem 1rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
        <div style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>Weekly Plan</div>
        <span style={{ fontSize: 10, color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.06em" }}>
          {isCustom ? "Custom" : (GOAL_LABELS[goal] ?? goal)}
        </span>
      </div>

      {isCustom && (coach || planTitle) && (
        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: "0.6rem" }}>
          {coach && <span>By {coach}</span>}
          {coach && planTitle && <span style={{ margin: "0 4px", opacity: 0.4 }}>·</span>}
          {planTitle && <span>{planTitle}</span>}
        </div>
      )}

      {/* Full week — compact, no Today duplicate */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {DAYS.map((day, i) => {
          const s       = activePlan[i];
          const isToday = i === todayIdx;
          const isRest  = s.type === "Rest";
          return (
            <div key={day} style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "4px 6px", borderRadius: 6,
              background: isToday ? "oklch(0.72 0.19 49 / 6%)" : "transparent",
            }}>
              <div style={{ width: 24, fontSize: "0.7rem", color: isToday ? "var(--cs-orange)" : "var(--muted-foreground)", fontWeight: isToday ? 700 : 400, flexShrink: 0 }}>{day}</div>
              <span style={{ fontSize: "0.8rem" }}>{s.emoji}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: isToday ? 600 : 400, color: isRest ? "var(--muted-foreground)" : isToday ? "var(--foreground)" : "var(--foreground)", whiteSpace: "nowrap" }}>{s.type}</span>
                <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{s.detail}</span>
              </div>
              {isToday && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cs-orange)", flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
