// Generates 1–2 personalised coach insights from real user data.
// No AI API needed — deterministic rules produce surprisingly personal-feeling copy.

interface InsightParams {
  monthXP:       number;
  totalSessions: number;
  monthSessions: number;
  streak:        number;
  rank:          number | null;
  level:         number;
}

export function generateInsights(p: InsightParams): string[] {
  const out: string[] = [];
  const now         = new Date();
  const dayOfMonth  = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthPace   = dayOfMonth / daysInMonth;
  const expected1k  = Math.round(1000 * monthPace);

  // ── XP pace insight ───────────────────────────────────────────────────
  if (p.monthXP > expected1k * 1.15) {
    out.push("You're ahead of your monthly XP target. Keep the momentum going!");
  } else if (p.monthXP < expected1k * 0.5 && dayOfMonth > 10) {
    const daysLeft = daysInMonth - dayOfMonth;
    out.push(`${daysLeft} days left this month. Pick up the pace to hit 1,000 XP.`);
  }

  // ── Streak insight ────────────────────────────────────────────────────
  if (p.streak >= 7) {
    out.push(`${p.streak}-session streak! You're in elite consistency territory. Protect it.`);
  } else if (p.streak >= 3) {
    out.push(`${p.streak}-session streak — real momentum building. Don't let it slip now.`);
  } else if (p.totalSessions > 0 && p.monthSessions === 0) {
    out.push("You haven't attended a session this month. One session today restarts everything.");
  }

  // ── Rank / milestone insight ──────────────────────────────────────────
  if (p.rank && p.rank <= 5 && out.length < 2) {
    out.push(`Top 5! You're in the elite. One more session and you could claim the top spot.`);
  } else if (p.rank && p.rank <= 15 && out.length < 2) {
    out.push(`Ranked #${p.rank} — you're in the top tier. Attend more to hold your ground.`);
  }

  // ── Milestone insight ─────────────────────────────────────────────────
  const nextTarget = [1, 5, 10, 25, 50].find(t => p.totalSessions < t);
  if (nextTarget && out.length < 2) {
    const left = nextTarget - p.totalSessions;
    out.push(
      left === 1
        ? `One more session unlocks your ${nextTarget}-session badge. Make it happen!`
        : `${left} sessions away from your ${nextTarget}-session badge.`
    );
  }

  // ── Level insight ─────────────────────────────────────────────────────
  if (out.length === 0) {
    out.push(`Level ${p.level} runner. Consistent attendance is the fastest way to level up.`);
  }

  return out.slice(0, 2);
}
