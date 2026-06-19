"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { calcMissToleranceStreak } from "@/lib/streak-utils";

interface SessionRecord {
  attended: boolean;
  sessions: { date: string; title: string; time: string | null; venue: string | null; location: string } | null;
}
interface UpcomingSession {
  id: string; title: string; date: string;
  time: string | null; venue: string | null; location: string;
}
interface PlanDay { type: string; detail: string; emoji: string; }

export interface Props {
  user: { firstName: string; goal: string; location: string; photo?: string | null; initials?: string };
  sessions: SessionRecord[];
  upcomingSessions: UpcomingSession[];
  joinedSessionIds: Set<string>;
  attendedSessionIds: Set<string>;
}

// ── Static plans ──────────────────────────────────────────────────────────────

const STATIC_PLANS: Record<string, PlanDay[]> = {
  "5k":    [{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"3 km at easy pace",emoji:"🏃"},{ type:"Cross Train",detail:"30 min walk or yoga",emoji:"🧘"},{ type:"Intervals",detail:"4 × 400m / 90s rest",emoji:"⚡"},{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"4 km easy",emoji:"🏃"},{ type:"Long Run",detail:"5 km steady",emoji:"🎯"}],
  "10k":   [{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"5 km at easy pace",emoji:"🏃"},{ type:"Tempo Run",detail:"4 km at tempo pace",emoji:"🔥"},{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Intervals",detail:"6 × 400m / 90s rest",emoji:"⚡"},{ type:"Easy Run",detail:"6 km easy",emoji:"🏃"},{ type:"Long Run",detail:"8 km steady",emoji:"🎯"}],
  "half":  [{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"8 km at easy pace",emoji:"🏃"},{ type:"Tempo Run",detail:"6 km at tempo",emoji:"🔥"},{ type:"Easy Run",detail:"6 km easy",emoji:"🏃"},{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Intervals",detail:"8 × 400m / 2m rest",emoji:"⚡"},{ type:"Long Run",detail:"14 km steady",emoji:"🎯"}],
  "full":  [{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"10 km at easy pace",emoji:"🏃"},{ type:"Tempo Run",detail:"8 km at tempo",emoji:"🔥"},{ type:"Easy Run",detail:"8 km easy",emoji:"🏃"},{ type:"Strength",detail:"Cross train + core",emoji:"💪"},{ type:"Medium Run",detail:"14 km steady",emoji:"🏃"},{ type:"Long Run",detail:"22 km easy",emoji:"🎯"}],
  "ultra": [{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"12 km at easy pace",emoji:"🏃"},{ type:"Tempo Run",detail:"10 km at tempo",emoji:"🔥"},{ type:"Easy Run",detail:"10 km easy",emoji:"🏃"},{ type:"Strength",detail:"Cross train + strength",emoji:"💪"},{ type:"Medium Run",detail:"20 km steady",emoji:"🏃"},{ type:"Long Run",detail:"35 km easy",emoji:"🎯"}],
  "speed": [{ type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Strides",detail:"6 × 100m strides",emoji:"💨"},{ type:"Tempo Run",detail:"5 km at race pace",emoji:"🔥"},{ type:"Easy Run",detail:"5 km easy",emoji:"🏃"},{ type:"Intervals",detail:"10 × 200m / 60s rest",emoji:"⚡"},{ type:"Easy Run",detail:"4 km easy",emoji:"🏃"},{ type:"Race Sim",detail:"5 km time trial",emoji:"🏁"}],
};

const FALLBACK: PlanDay[] = [
  { type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"4 km at easy pace",emoji:"🏃"},
  { type:"Cross Train",detail:"30 min yoga or walk",emoji:"🧘"},{ type:"Easy Run",detail:"4 km easy",emoji:"🏃"},
  { type:"Rest",detail:"Recovery day",emoji:"😴"},{ type:"Easy Run",detail:"5 km easy",emoji:"🏃"},
  { type:"Long Run",detail:"6 km steady",emoji:"🎯"},
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcMonthly(sessions: SessionRecord[]): number {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  return sessions.filter(r => r.attended && r.sessions && new Date(r.sessions.date) >= start).length;
}

function dayLabel(d: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff  = Math.round((new Date(d + "T00:00:00").getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return ` · ${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardHero({ user, sessions, upcomingSessions, joinedSessionIds, attendedSessionIds }: Props) {
  const router      = useRouter();
  const [plan, setPlan] = useState<PlanDay | null>(null);

  useEffect(() => {
    const p = STATIC_PLANS[user.goal] ?? FALLBACK;
    setPlan(p[(new Date().getDay() + 6) % 7]);
  }, [user.goal]);

  const streak  = calcMissToleranceStreak(
    sessions
      .filter(r => r.sessions !== null)
      .map(r => ({ attended: r.attended, date: r.sessions!.date }))
  );
  const monthly  = calcMonthly(sessions);
  // Prefer a session the user is registered for (and not yet attended).
  // Fall back to the first upcoming session (unregistered) so there's always something to join.
  const registeredNext = upcomingSessions.find(s => joinedSessionIds.has(s.id) && !attendedSessionIds.has(s.id)) ?? null;
  const nextSess = registeredNext ?? (upcomingSessions.find(s => !attendedSessionIds.has(s.id)) ?? null);
  const isRest   = plan?.type === "Rest";
  const joined = nextSess ? joinedSessionIds.has(nextSess.id) : false;

  return (
    <div style={{ marginBottom: "0.25rem" }}>

      {/* ── Greeting (open layout, no card) ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: "0.75rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: 4 }}>
            {greeting()},
          </div>
          <h1 style={{
            fontSize: "clamp(1.75rem, 6vw, 2.25rem)",
            fontWeight: 800,
            color: "var(--foreground)",
            margin: "0 0 8px",
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
          }}>
            {user.firstName}
          </h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {streak > 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 20, padding: "4px 10px" }}>
                <span style={{ fontSize: "0.8rem" }}>🔥</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--cs-orange)" }}>{streak}-session streak</span>
              </div>
            )}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "4px 10px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--foreground)", flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--foreground)" }}>{monthly} this month</span>
            </div>
          </div>
        </div>

        {/* Avatar */}
        {user.photo ? (
          <img src={user.photo} alt={user.firstName} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2.5px solid var(--cs-orange)", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "2.5px solid var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", fontWeight: 800, color: "var(--cs-orange)", flexShrink: 0 }}>
            {user.initials ?? user.firstName[0]?.toUpperCase()}
          </div>
        )}
      </div>

      {/* ── Today's Workout card ── */}
      {plan && (
        <div className="cs-clean-card" style={{ marginBottom: "0.625rem" }}>
          <div className="cs-label" style={{ marginBottom: 10 }}>Today&apos;s Workout</div>
          {/* Row 1: icon + text info */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", minWidth: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              background: isRest ? "rgba(255,255,255,0.04)" : "oklch(0.72 0.19 49 / 10%)",
              border: isRest ? "1px solid rgba(255,255,255,0.06)" : "1px solid oklch(0.72 0.19 49 / 20%)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.35rem",
            }}>
              {plan.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.type}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.detail}</div>
            </div>
          </div>
          {/* Row 2: CTA button — full width so it never overflows on any screen width */}
          {!isRest && (
            <button
              onClick={() => router.push("/weekend-run")}
              style={{ display: "block", width: "100%", marginTop: "0.75rem", padding: "10px", background: "var(--gradient-accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", boxShadow: "var(--shadow-orange)", textAlign: "center" }}>
              Register for a Session →
            </button>
          )}
        </div>
      )}

      {/* ── Next session card ── */}
      {nextSess && (
        <div style={{
          background: "var(--surface)",
          borderRadius: 16,
          padding: "1.25rem",
          border: joined
            ? "1px solid oklch(0.74 0.22 150 / 20%)"
            : "1px solid rgba(255,255,255,0.06)",
          marginBottom: "0.625rem",
          minWidth: 0,
          overflow: "hidden",
          boxSizing: "border-box",
          width: "100%",
        }}>
          <div className="cs-label" style={{ marginBottom: 10, color: joined ? "#4ade80" : "var(--cs-orange)" }}>
            {joined ? "Your Upcoming Session" : "Up Next"}
          </div>
          {/* Row 1: icon + session title + date */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", minWidth: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              background: joined ? "oklch(0.74 0.22 150 / 8%)" : "rgba(255,255,255,0.04)",
              border: joined ? "1px solid oklch(0.74 0.22 150 / 20%)" : "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {joined ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted-foreground)" }}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              {/* Session title — truncates gracefully for any length name */}
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nextSess.title}
              </div>
              {/* Date + time on one line */}
              <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {dayLabel(nextSess.date)}{fmtTime(nextSess.time)}
              </div>
              {/* Venue on its own line so long names don't force overflow */}
              {nextSess.venue && (
                <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📍 {nextSess.venue}
                </div>
              )}
            </div>
          </div>
          {/* Row 2: CTA button — full width so it is always fully visible */}
          {joined ? (
            <button
              onClick={() => router.push("/scan")}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: "0.75rem", padding: "10px", background: "rgba(96,165,250,0.12)", color: "rgba(147,197,253,1)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 10, fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", boxSizing: "border-box" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              Scan QR to Mark Attendance
            </button>
          ) : (
            <button
              onClick={() => router.push(`/join/${nextSess.id}`)}
              style={{ display: "block", width: "100%", marginTop: "0.75rem", padding: "10px", background: "var(--gradient-accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", boxShadow: "var(--shadow-orange)", textAlign: "center", boxSizing: "border-box" }}>
              Join Session →
            </button>
          )}
        </div>
      )}


      {/* Streak reset nudge */}
      {streak === 0 && sessions.some(r => r.sessions !== null) && (
        <div style={{ padding: "0.6rem 0.875rem", fontSize: "0.72rem", color: "oklch(0.7 0.15 30)", display: "flex", alignItems: "center", gap: 4 }}>
          <span>⚠️</span> Two missed sessions reset your streak. Come back strong!
        </div>
      )}
    </div>
  );
}
