"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionRecord {
  attended: boolean;
  sessions: { date: string; title: string; time: string | null; venue: string | null; location: string } | null;
}

interface UpcomingSession {
  id: string; title: string; date: string;
  time: string | null; venue: string | null; location: string;
}

interface PlanDay { type: string; detail: string; emoji: string; }
interface NearbyRunner { user_name: string; location: string; month_points: number; }

export interface Props {
  user: { firstName: string; goal: string; location: string };
  sessions: SessionRecord[];          // attendance history (already in Dashboard state)
  upcomingSessions: UpcomingSession[];
  joinedSessionIds: Set<string>;
}

// ── Static training plans (Mon=0 … Sun=6) ────────────────────────────────────

const STATIC_PLANS: Record<string, PlanDay[]> = {
  "5k": [
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Easy Run",    detail: "3 km at easy pace",        emoji: "🏃" },
    { type: "Cross Train", detail: "30 min walk or yoga",      emoji: "🧘" },
    { type: "Intervals",   detail: "4 × 400m with 90s rest",   emoji: "⚡" },
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Easy Run",    detail: "4 km easy",                emoji: "🏃" },
    { type: "Long Run",    detail: "5 km steady pace",         emoji: "🎯" },
  ],
  "10k": [
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Easy Run",    detail: "5 km at easy pace",        emoji: "🏃" },
    { type: "Tempo Run",   detail: "4 km at tempo pace",       emoji: "🔥" },
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Intervals",   detail: "6 × 400m with 90s rest",   emoji: "⚡" },
    { type: "Easy Run",    detail: "6 km easy",                emoji: "🏃" },
    { type: "Long Run",    detail: "8 km steady pace",         emoji: "🎯" },
  ],
  "half": [
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Easy Run",    detail: "8 km at easy pace",        emoji: "🏃" },
    { type: "Tempo Run",   detail: "6 km at tempo pace",       emoji: "🔥" },
    { type: "Easy Run",    detail: "6 km easy",                emoji: "🏃" },
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Intervals",   detail: "8 × 400m with 2m rest",    emoji: "⚡" },
    { type: "Long Run",    detail: "14 km steady pace",        emoji: "🎯" },
  ],
  "full": [
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Easy Run",    detail: "10 km at easy pace",       emoji: "🏃" },
    { type: "Tempo Run",   detail: "8 km at tempo pace",       emoji: "🔥" },
    { type: "Easy Run",    detail: "8 km easy",                emoji: "🏃" },
    { type: "Strength",    detail: "Cross train + core",       emoji: "💪" },
    { type: "Medium Run",  detail: "14 km steady pace",        emoji: "🏃" },
    { type: "Long Run",    detail: "22 km easy pace",          emoji: "🎯" },
  ],
  "ultra": [
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Easy Run",    detail: "12 km at easy pace",       emoji: "🏃" },
    { type: "Tempo Run",   detail: "10 km at tempo pace",      emoji: "🔥" },
    { type: "Easy Run",    detail: "10 km easy",               emoji: "🏃" },
    { type: "Strength",    detail: "Cross train + strength",   emoji: "💪" },
    { type: "Medium Run",  detail: "20 km steady",             emoji: "🏃" },
    { type: "Long Run",    detail: "35 km easy pace",          emoji: "🎯" },
  ],
  "speed": [
    { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
    { type: "Strides",     detail: "6 × 100m strides",        emoji: "💨" },
    { type: "Tempo Run",   detail: "5 km at race pace",        emoji: "🔥" },
    { type: "Easy Run",    detail: "5 km easy",                emoji: "🏃" },
    { type: "Intervals",   detail: "10 × 200m with 60s rest",  emoji: "⚡" },
    { type: "Easy Run",    detail: "4 km easy",                emoji: "🏃" },
    { type: "Race Sim",    detail: "5 km time trial",          emoji: "🏁" },
  ],
};

const FALLBACK_PLAN: PlanDay[] = [
  { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
  { type: "Easy Run",    detail: "4 km at easy pace",        emoji: "🏃" },
  { type: "Cross Train", detail: "30 min yoga or walk",      emoji: "🧘" },
  { type: "Easy Run",    detail: "4 km easy",                emoji: "🏃" },
  { type: "Rest",        detail: "Recovery day",             emoji: "😴" },
  { type: "Easy Run",    detail: "5 km easy",                emoji: "🏃" },
  { type: "Long Run",    detail: "6 km steady pace",         emoji: "🎯" },
];

// ── Streak from session attendance ────────────────────────────────────────────
// Rules: each attended session extends streak by 1.
// Two consecutive MISSED sessions resets streak to 0.

function calcSessionStreak(sessions: SessionRecord[]): number {
  const past = sessions
    .filter(r => r.sessions !== null)
    .sort((a, b) => new Date(b.sessions!.date).getTime() - new Date(a.sessions!.date).getTime());

  let streak = 0;
  let consecutiveMisses = 0;

  for (const rec of past) {
    if (rec.attended) {
      streak++;
      consecutiveMisses = 0;
    } else {
      consecutiveMisses++;
      if (consecutiveMisses >= 2) break;
    }
  }
  return streak;
}

// ── Sessions attended this calendar month ────────────────────────────────────

function calcMonthlySessions(sessions: SessionRecord[]): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return sessions.filter(r =>
    r.attended && r.sessions && new Date(r.sessions.date) >= monthStart
  ).length;
}

// ── Coach tip (plan-based, no Strava needed) ──────────────────────────────────

function coachTip(plan: PlanDay | null, streak: number, monthlySessions: number): string {
  if (!plan) return "Every session counts. Show up today.";

  if (plan.type === "Rest") {
    return "Rest is training. Today your muscles rebuild. Stay off your feet and stay hydrated.";
  }
  if (plan.type === "Long Run") {
    return "Start 30 sec/km slower than feels right. You'll thank yourself in the final kilometres.";
  }
  if (plan.type === "Intervals") {
    return "Warm up 10 minutes before your first rep. Nail the recovery between sets — that's where the gains are.";
  }
  if (plan.type === "Tempo Run") {
    return "Tempo pace = comfortably hard. You should be able to say three words, not a sentence.";
  }
  if (plan.type === "Easy Run") {
    return "Easy really means easy. If you can't hold a full conversation, slow down.";
  }
  if (streak >= 5) {
    return `${streak} sessions strong! Consistency is your superpower. Keep it going.`;
  }
  if (monthlySessions === 0) {
    return "First session of the month — make it count. Every comeback starts with one step.";
  }
  return `Today: ${plan.detail}. Trust the process — consistency beats intensity every time.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good Morning",   emoji: "☀️"  };
  if (h < 17) return { text: "Good Afternoon", emoji: "🌤️" };
  return            { text: "Good Evening",    emoji: "🌙"  };
}

function dayLabel(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function initials(name: string) {
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardHero({ user, sessions, upcomingSessions, joinedSessionIds }: Props) {
  const router = useRouter();
  const [todayPlan,     setTodayPlan]     = useState<PlanDay | null>(null);
  const [nearbyRunners, setNearbyRunners] = useState<NearbyRunner[]>([]);

  // Today's plan from static map (custom plan override via API)
  useEffect(() => {
    const staticPlan = STATIC_PLANS[user.goal] ?? FALLBACK_PLAN;
    const todayIdx   = (new Date().getDay() + 6) % 7; // Mon=0
    setTodayPlan(staticPlan[todayIdx]);
  }, [user.goal]);

  // Nearby runners (same city)
  useEffect(() => {
    if (!user.location) return;
    fetch(`/api/users/search?q=${encodeURIComponent(user.location)}`)
      .then(r => r.json())
      .then(d => { if (d.users) setNearbyRunners(d.users.slice(0, 6)); })
      .catch(() => {});
  }, [user.location]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const { text: greeting, emoji: greetEmoji } = getGreeting();
  const streak          = calcSessionStreak(sessions);
  const monthlySessions = calcMonthlySessions(sessions);
  const tip             = coachTip(todayPlan, streak, monthlySessions);
  const nextSess        = upcomingSessions[0] ?? null;

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1.25rem" }}>

      {/* ── Greeting + today's workout ──────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, oklch(0.19 0.015 270) 0%, oklch(0.22 0.02 280) 100%)",
        border: "1px solid var(--border)", borderRadius: 16, padding: "1.5rem",
        boxShadow: "var(--shadow-md)", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 10%)", filter: "blur(40px)", pointerEvents: "none" }} />

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
            {dateLabel}
          </div>
          <div className="font-display" style={{ fontSize: "clamp(1.4rem, 4vw, 1.75rem)", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.15, marginBottom: "1.25rem" }}>
            {greetEmoji} {greeting}, {user.firstName}
          </div>

          {/* Today's workout */}
          {todayPlan && (
            <div style={{
              background: todayPlan.type === "Rest" ? "rgba(255,255,255,0.03)" : "oklch(0.72 0.19 49 / 8%)",
              border: `1px solid ${todayPlan.type === "Rest" ? "rgba(255,255,255,0.06)" : "oklch(0.72 0.19 49 / 25%)"}`,
              borderRadius: 12, padding: "1rem 1.1rem",
              display: "flex", alignItems: "center", gap: "1rem",
              marginBottom: "1.25rem",
            }}>
              <div style={{ fontSize: "2rem", flexShrink: 0, lineHeight: 1 }}>{todayPlan.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "10px", color: todayPlan.type === "Rest" ? "var(--muted-foreground)" : "var(--primary)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "2px", fontWeight: 600 }}>
                  Today's Workout
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)" }}>{todayPlan.type}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "1px" }}>{todayPlan.detail}</div>
              </div>
              {todayPlan.type !== "Rest" && (
                <button
                  onClick={() => router.push("/weekend-run")}
                  style={{ flexShrink: 0, padding: "7px 14px", background: "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", borderRadius: 8, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", boxShadow: "var(--shadow-orange)", whiteSpace: "nowrap" }}>
                  Register →
                </button>
              )}
            </div>
          )}

          {/* Stats: streak + sessions this month */}
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            {/* Streak */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.1rem" }}>🔥</span>
              <div>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: streak > 0 ? "var(--primary)" : "var(--muted-foreground)" }}>
                  {streak > 0 ? streak : 0}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginLeft: "4px" }}>
                  {streak === 1 ? "session streak" : "session streak"}
                </span>
                {streak >= 3 && (
                  <span style={{ fontSize: "0.65rem", color: "var(--primary)", marginLeft: "6px", fontWeight: 600 }}>
                    {streak >= 10 ? "🏆 On fire!" : streak >= 5 ? "⚡ Hot streak" : "Keep it up!"}
                  </span>
                )}
              </div>
            </div>

            {/* Sessions this month */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.1rem" }}>📅</span>
              <div>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)" }}>
                  {monthlySessions}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginLeft: "4px" }}>
                  {monthlySessions === 1 ? "session this month" : "sessions this month"}
                </span>
              </div>
            </div>
          </div>

          {/* Reset warning if streak = 0 but has history */}
          {streak === 0 && sessions.some(r => r.sessions !== null) && (
            <div style={{ marginTop: "0.6rem", fontSize: "0.72rem", color: "oklch(0.7 0.15 30)", display: "flex", alignItems: "center", gap: "4px" }}>
              <span>⚠️</span> Missing 2 consecutive sessions reset your streak. Come back strong!
            </div>
          )}
        </div>
      </div>

      {/* ── Upcoming session ─────────────────────────────────────────────── */}
      {nextSess && (() => {
        const joined  = joinedSessionIds.has(nextSess.id);
        const label   = dayLabel(nextSess.date);
        const isToday = label === "Today";
        return (
          <div style={{ background: "var(--surface)", border: `1px solid ${isToday ? "oklch(0.74 0.22 150 / 25%)" : "var(--border)"}`, borderRadius: 12, padding: "1rem 1.25rem", boxShadow: "var(--shadow-md)", display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontSize: "1.5rem", flexShrink: 0 }}>📅</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10px", color: isToday ? "#4ade80" : "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "2px" }}>
                {isToday ? "Happening Today" : "Up Next"}
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nextSess.title}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "1px" }}>
                {label}{nextSess.time ? ` · ${nextSess.time}` : ""}{nextSess.venue ? ` · ${nextSess.venue}` : ""}
              </div>
            </div>
            {joined ? (
              <span style={{ flexShrink: 0, fontSize: "0.75rem", fontWeight: 700, color: "#4ade80" }}>✓ Joined</span>
            ) : (
              <button
                onClick={() => router.push(`/join/${nextSess.id}`)}
                style={{ flexShrink: 0, padding: "7px 14px", background: "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", borderRadius: 8, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", boxShadow: "var(--shadow-orange)" }}>
                Join →
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Coach tip ────────────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem", boxShadow: "var(--shadow-md)", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 12%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", display: "grid", placeItems: "center", fontSize: "0.9rem" }}>💬</div>
        <div>
          <div style={{ fontSize: "10px", color: "var(--primary)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "4px" }}>Coach Says</div>
          <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.65, fontStyle: "italic" }}>
            &ldquo;{tip}&rdquo;
          </div>
        </div>
      </div>

      {/* ── Nearby runners ───────────────────────────────────────────────── */}
      {nearbyRunners.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem", boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: "10px", color: "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>
            🏃 Running near you · {user.location}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {nearbyRunners.slice(0, 5).map((r, i) => (
              <div key={i} title={r.user_name} style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "var(--gradient-primary)",
                display: "grid", placeItems: "center",
                fontSize: "0.7rem", fontWeight: 700, color: "#fff",
                fontFamily: "var(--font-display)",
                border: "2px solid var(--background)",
                marginLeft: i === 0 ? 0 : -8, flexShrink: 0,
              }}>
                {initials(r.user_name)}
              </div>
            ))}
            <span style={{ marginLeft: "0.35rem", fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
              <strong style={{ color: "var(--foreground)" }}>{nearbyRunners.length}</strong>{" "}
              runner{nearbyRunners.length !== 1 ? "s" : ""} active in {user.location} this month
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
