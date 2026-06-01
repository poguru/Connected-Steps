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
    { type: "Intervals",   detail: "4 × 400m with 90s rest", emoji: "⚡" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "4 km easy",              emoji: "🏃" },
    { type: "Long Run",    detail: "5 km steady pace",       emoji: "🎯" },
  ],
  "10k": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "5 km at easy pace",      emoji: "🏃" },
    { type: "Tempo Run",   detail: "4 km at tempo pace",     emoji: "🔥" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Intervals",   detail: "6 × 400m with 90s rest", emoji: "⚡" },
    { type: "Easy Run",    detail: "6 km easy",              emoji: "🏃" },
    { type: "Long Run",    detail: "8 km steady pace",       emoji: "🎯" },
  ],
  "half": [
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Easy Run",    detail: "8 km at easy pace",      emoji: "🏃" },
    { type: "Tempo Run",   detail: "6 km at tempo pace",     emoji: "🔥" },
    { type: "Easy Run",    detail: "6 km easy",              emoji: "🏃" },
    { type: "Rest",        detail: "Recovery day",           emoji: "😴" },
    { type: "Intervals",   detail: "8 × 400m with 2m rest",  emoji: "⚡" },
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
};

const GOAL_LABELS: Record<string, string> = {
  "5k": "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
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
      .then((r) => r.json())
      .then((d) => {
        if (d.plan?.days?.length === 7) {
          setPlan(d.plan.days);
          setPlanTitle(d.plan.title ?? null);
          setCoach(d.plan.coach_name ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  const staticPlan = STATIC_PLANS[goal];
  const activePlan = plan ?? staticPlan;
  const isCustom   = !!plan;

  if (loading) return (
    <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem", minHeight: "120px", opacity: 0.5 }} />
  );

  if (!activePlan) return null;

  const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0…Sun=6
  const today      = activePlan[todayIndex];

  return (
    <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
        <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Training Plan</div>
        <span style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.06em" }}>
          {isCustom ? "Custom" : (GOAL_LABELS[goal] ?? goal)}
        </span>
      </div>

      {/* Coach / week label */}
      {isCustom && (coach || planTitle) && (
        <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
          {coach && <span>By {coach}</span>}
          {coach && planTitle && <span style={{ margin: "0 4px", opacity: 0.4 }}>·</span>}
          {planTitle && <span>{planTitle}</span>}
        </div>
      )}

      {/* Today highlight */}
      <div style={{ background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ fontSize: "1.6rem" }}>{today.emoji}</div>
        <div>
          <div style={{ fontSize: "10px", color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Today · {DAYS[todayIndex]}</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--cs-white)" }}>{today.type}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--cs-muted)" }}>{today.detail}</div>
        </div>
      </div>

      {/* Full week */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {DAYS.map((day, i) => {
          const s       = activePlan[i];
          const isToday = i === todayIndex;
          const isRest  = s.type === "Rest";
          return (
            <div key={day} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "5px 6px", borderRadius: "5px", background: isToday ? "rgba(232,98,10,0.06)" : "transparent" }}>
              <div style={{ width: "28px", fontSize: "10px", color: isToday ? "var(--cs-orange)" : "var(--cs-muted)", fontWeight: isToday ? 700 : 400, letterSpacing: "0.04em" }}>{day}</div>
              <div style={{ fontSize: "0.85rem" }}>{s.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "0.78rem", fontWeight: isToday ? 600 : 400, color: isRest ? "var(--cs-muted)" : isToday ? "var(--cs-white)" : "var(--cs-off-white)" }}>{s.type}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--cs-muted)", marginLeft: "6px" }}>{s.detail}</span>
              </div>
              {isToday && <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--cs-orange)", flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
