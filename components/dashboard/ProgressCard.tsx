"use client";

import { Card, ProgressBar, Skeleton } from "@/components/ui/ds";

interface Achievement { icon: string; label: string; earned: boolean; }

interface Props {
  totalPoints:   number;
  monthPoints:   number;
  monthSessions: number;
  totalSessions: number;
  achievements:  Achievement[];
  loading?:      boolean;
}

const TIERS = [
  { name: "Starter",           min: 0,  max: 5,        color: "#9ca3af" },
  { name: "Pacer",             min: 5,  max: 10,       color: "#60a5fa" },
  { name: "Consistent Runner", min: 10, max: 25,       color: "#a855f7" },
  { name: "Endurance Runner",  min: 25, max: 50,       color: "#e8620a" },
  { name: "Elite Runner",      min: 50, max: Infinity, color: "#4ade80" },
];

function getTier(sessions: number) {
  const idx  = TIERS.findIndex(t => sessions < t.max);
  const tier = idx === -1 ? TIERS[TIERS.length - 1] : TIERS[idx];
  const span = tier.max === Infinity ? 1 : tier.max - tier.min;
  const prog = tier.max === Infinity ? 1 : Math.min((sessions - tier.min) / span, 1);
  const next = idx !== -1 && idx + 1 < TIERS.length ? TIERS[idx + 1] : null;
  return { tier, level: (idx === -1 ? TIERS.length : idx) + 1, progress: prog, remaining: tier.max === Infinity ? 0 : tier.max - sessions, nextTier: next };
}

const MONTHLY_TARGET = 8;

export default function ProgressCard({ totalPoints, monthSessions, totalSessions, achievements, loading }: Props) {
  const earned = achievements.filter(a => a.earned).length;
  const { tier, level, progress, remaining, nextTier } = getTier(totalSessions);
  const monthPct = Math.min(monthSessions / MONTHLY_TARGET, 1);

  if (loading) return (
    <Card style={{ marginBottom: "1rem" }}>
      <Skeleton width="60%" height="14px" style={{ marginBottom: 10 }} />
      <Skeleton width="40%" height="14px" style={{ marginBottom: 10 }} />
      <Skeleton width="80%" height="14px" />
    </Card>
  );

  return (
    <Card style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: "1rem" }}>

      {/* Header */}
      <div className="cs-label" style={{ marginBottom: "1rem" }}>My Progress</div>

      {/* Tier + level row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", letterSpacing: "0.04em", marginBottom: 2 }}>
            LEVEL {level}
          </div>
          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: tier.color, letterSpacing: "-0.01em" }}>
            {tier.name}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-1px", lineHeight: 1 }}>
            {totalPoints.toLocaleString()}
          </div>
          <div style={{ fontSize: "9px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
            total points
          </div>
        </div>
      </div>

      {/* Tier progress bar */}
      <ProgressBar value={progress * 100} max={100} color={tier.color} height={5} style={{ marginBottom: "0.25rem" }} />
      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
        {tier.max === Infinity
          ? "Maximum tier reached"
          : remaining === 0
          ? `${nextTier?.name ?? "next tier"} unlocked!`
          : `${remaining} session${remaining !== 1 ? "s" : ""} to ${nextTier?.name ?? "next tier"}`}
      </div>

      {/* Stats strip */}
      <div style={{ display: "flex", gap: 1, background: "rgba(255,255,255,0.05)", borderRadius: 10, overflow: "hidden", marginBottom: "1rem" }}>
        {[
          { val: totalSessions, label: "Sessions" },
          { val: monthSessions, label: "This Month" },
          { val: `${earned}/${achievements.length}`, label: "Badges" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "var(--surface)", padding: "10px 6px", textAlign: "center" }}>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--foreground)", letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: "9px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Monthly goal */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--foreground)" }}>Monthly Goal</div>
          <div style={{ fontSize: "0.75rem", color: monthSessions >= MONTHLY_TARGET ? "#4ade80" : "var(--cs-orange)", fontWeight: 700 }}>
            {monthSessions}/{MONTHLY_TARGET} sessions
          </div>
        </div>
        <ProgressBar value={monthSessions} max={MONTHLY_TARGET} height={5}
          color={monthSessions >= MONTHLY_TARGET ? "#4ade80" : "var(--cs-orange)"} />
      </div>

      {/* Achievements strip */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflowX: "auto", paddingBottom: 2 }}>
        {achievements.map(a => (
          <div key={a.label} title={a.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: a.earned ? 1 : 0.28, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: a.earned ? tier.color : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {a.earned ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              )}
            </div>
            <span style={{ fontSize: "9px", color: a.earned ? tier.color : "var(--muted-foreground)", whiteSpace: "nowrap", fontWeight: a.earned ? 700 : 400 }}>{a.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
