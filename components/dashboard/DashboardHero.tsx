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

export default function DashboardHero({ user, sessions, upcomingSessions, joinedSessionIds }: Props) {
  const router      = useRouter();
  const [plan, setPlan] = useState<PlanDay | null>(null);

  useEffect(() => {
    const p = STATIC_PLANS[user.goal] ?? FALLBACK;
    setPlan(p[(new Date().getDay() + 6) % 7]);
  }, [user.goal]);

  const streak   = calcMissToleranceStreak(
    sessions
      .filter(r => r.sessions !== null)
      .map(r => ({ attended: r.attended, date: r.sessions!.date }))
  );
  const monthly  = calcMonthly(sessions);
  const nextSess = upcomingSessions[0] ?? null;
  const isRest   = plan?.type === "Rest";
  const joined   = nextSess ? joinedSessionIds.has(nextSess.id) : false;

  return (
    <div style={{
      background: "linear-gradient(135deg, oklch(0.17 0.018 270) 0%, oklch(0.21 0.025 290) 100%)",
      border: "1px solid var(--border)", borderRadius: 16,
      overflow: "hidden", marginBottom: "1rem",
      boxShadow: "var(--shadow-md)", position: "relative",
    }}>
      {/* Ambient glow */}
      <div style={{ position:"absolute", top:-60, right:-40, width:200, height:200, borderRadius:"50%", background:"oklch(0.72 0.19 49 / 8%)", filter:"blur(50px)", pointerEvents:"none" }} />

      {/* ── Top: avatar + greeting + chips ──────────────────────────── */}
      <div style={{ padding:"1rem 1.25rem 0.75rem", display:"flex", alignItems:"center", gap:"0.75rem", position:"relative" }}>
        {/* Avatar */}
        {user.photo ? (
          <img src={user.photo} alt={user.firstName} style={{ width:42, height:42, borderRadius:"50%", objectFit:"cover", border:"2px solid var(--cs-orange)", flexShrink:0, display:"block" }} />
        ) : (
          <div style={{ width:42, height:42, borderRadius:"50%", background:"oklch(0.72 0.19 49 / 15%)", border:"2px solid var(--cs-orange)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.88rem", fontWeight:800, color:"var(--cs-orange)", flexShrink:0 }}>
            {user.initials ?? user.firstName[0]?.toUpperCase()}
          </div>
        )}

        {/* Greeting text */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:"0.65rem", color:"var(--muted-foreground)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:1 }}>
            {new Date().toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long" })}
          </div>
          <div style={{ fontSize:"1rem", fontWeight:700, color:"var(--foreground)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {greeting()}, <span style={{ color:"var(--cs-orange)" }}>{user.firstName}</span>
          </div>
        </div>

        {/* Chips */}
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          {streak > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(232,98,10,0.1)", border:"1px solid rgba(232,98,10,0.25)", borderRadius:20, padding:"4px 8px" }}>
              <span style={{ fontSize:"0.8rem" }}>🔥</span>
              <span style={{ fontSize:"11px", fontWeight:700, color:"var(--cs-orange)" }}>{streak}</span>
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)", borderRadius:20, padding:"4px 8px" }}>
            <span style={{ fontSize:"0.8rem" }}>📅</span>
            <span style={{ fontSize:"11px", fontWeight:700, color:"var(--foreground)" }}>{monthly}</span>
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div style={{ height:"1px", background:"var(--border)", margin:"0 1.25rem" }} />

      {/* ── Today's workout row ───────────────────────────────────────── */}
      <div style={{ padding:"0.75rem 1.25rem", display:"flex", alignItems:"center", gap:"0.75rem", position:"relative" }}>
        <div style={{
          width:40, height:40, borderRadius:10, flexShrink:0,
          background: isRest ? "rgba(255,255,255,0.04)" : "oklch(0.72 0.19 49 / 10%)",
          border: isRest ? "1px solid rgba(255,255,255,0.06)" : "1px solid oklch(0.72 0.19 49 / 20%)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem",
        }}>
          {plan?.emoji ?? "🏃"}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:"9px", color: isRest ? "var(--muted-foreground)" : "var(--primary)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700, marginBottom:1 }}>
            Today's Workout
          </div>
          <div style={{ fontSize:"0.9rem", fontWeight:700, color:"var(--foreground)", display:"flex", alignItems:"center", gap:6 }}>
            {plan?.type ?? "Loading…"}
          </div>
          {plan?.detail && (
            <div style={{ fontSize:"0.75rem", color:"var(--muted-foreground)", marginTop:1 }}>{plan.detail}</div>
          )}
        </div>
        {!isRest && (
          <button
            onClick={() => router.push("/weekend-run")}
            style={{ flexShrink:0, padding:"7px 14px", background:"var(--gradient-accent)", color:"var(--accent-foreground)", border:"none", borderRadius:8, fontSize:"12px", fontWeight:700, cursor:"pointer", fontFamily:"var(--font-body)", boxShadow:"var(--shadow-orange)", whiteSpace:"nowrap" }}>
            Register →
          </button>
        )}
      </div>

      {/* ── Next session row (only if exists) ────────────────────────── */}
      {nextSess && (
        <>
          <div style={{ height:"1px", background:"var(--border)", margin:"0 1.25rem" }} />
          <div style={{ padding:"0.65rem 1.25rem", display:"flex", alignItems:"center", gap:"0.75rem" }}>
            <div style={{
              width:40, height:40, borderRadius:10, flexShrink:0,
              background: joined ? "oklch(0.74 0.22 150 / 8%)" : "rgba(255,255,255,0.04)",
              border: joined ? "1px solid oklch(0.74 0.22 150 / 20%)" : "1px solid var(--border)",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem",
            }}>
              {joined ? "✅" : "📅"}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"9px", color: joined ? "#4ade80" : "var(--muted-foreground)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700, marginBottom:1 }}>
                {joined ? "You're registered" : "Up Next"}
              </div>
              <div style={{ fontSize:"0.85rem", fontWeight:600, color:"var(--foreground)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {nextSess.title}
              </div>
              <div style={{ fontSize:"0.72rem", color:"var(--muted-foreground)" }}>
                {dayLabel(nextSess.date)}{fmtTime(nextSess.time)}{nextSess.venue ? ` · ${nextSess.venue}` : ""}
              </div>
            </div>
            {joined ? (
              <div style={{ flexShrink:0, fontSize:"12px", fontWeight:700, color:"#4ade80" }}>✓ Joined</div>
            ) : (
              <button
                onClick={() => router.push(`/join/${nextSess.id}`)}
                style={{ flexShrink:0, padding:"7px 14px", background:"var(--gradient-accent)", color:"var(--accent-foreground)", border:"none", borderRadius:8, fontSize:"12px", fontWeight:700, cursor:"pointer", fontFamily:"var(--font-body)", boxShadow:"var(--shadow-orange)", whiteSpace:"nowrap" }}>
                Join →
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Streak reset nudge ────────────────────────────────────────── */}
      {streak === 0 && sessions.some(r => r.sessions !== null) && (
        <div style={{ padding:"0 1.25rem 0.75rem", fontSize:"0.72rem", color:"oklch(0.7 0.15 30)", display:"flex", alignItems:"center", gap:4 }}>
          <span>⚠️</span> Two missed sessions reset your streak. Come back strong!
        </div>
      )}
    </div>
  );
}
