import type { UserSession } from "../types";

export interface StreakInfo {
  sessions: number;  // consecutive attended sessions
  weekly:   number;  // consecutive weeks with ≥1 session
  monthly:  number;  // consecutive months with ≥1 session
  isActive: boolean; // attended a session in the last 14 days
}

export function computeStreaks(history: UserSession[]): StreakInfo {
  const attended = history
    .filter(r => r.attended && r.sessions?.date)
    .map(r => new Date(r.sessions!.date + "T00:00:00"))
    .sort((a, b) => b.getTime() - a.getTime()); // newest first

  if (attended.length === 0) return { sessions: 0, weekly: 0, monthly: 0, isActive: false };

  const now        = Date.now();
  const daysSince  = (now - attended[0].getTime()) / 86400000;
  const isActive   = daysSince <= 14;

  // ── Session streak (gap tolerance: 14 days) ───────────────────────────
  let sessions = 1;
  for (let i = 1; i < attended.length; i++) {
    const gap = (attended[i - 1].getTime() - attended[i].getTime()) / 86400000;
    if (gap <= 14) sessions++;
    else break;
  }

  // ── Weekly streak (consecutive calendar weeks with ≥1 session) ───────
  function isoWeekStart(d: Date): number {
    const s = new Date(d);
    const day = s.getDay();
    s.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    s.setHours(0, 0, 0, 0);
    return s.getTime();
  }
  const weekSet  = [...new Set(attended.map(isoWeekStart))].sort((a, b) => b - a);
  let weekly = 1;
  for (let i = 1; i < weekSet.length; i++) {
    const weeksDiff = Math.round((weekSet[i - 1] - weekSet[i]) / (7 * 86400000));
    if (weeksDiff === 1) weekly++;
    else break;
  }

  // ── Monthly streak ────────────────────────────────────────────────────
  const monthSet = [...new Set(attended.map(d => d.toISOString().slice(0, 7)))].sort().reverse();
  let monthly = 1;
  for (let i = 1; i < monthSet.length; i++) {
    const [y1, m1] = monthSet[i - 1].split("-").map(Number);
    const [y2, m2] = monthSet[i].split("-").map(Number);
    const diff = (y1 - y2) * 12 + (m1 - m2);
    if (diff === 1) monthly++;
    else break;
  }

  return { sessions, weekly, monthly, isActive };
}

export function streakEmoji(count: number): string {
  if (count >= 20) return "🌋";
  if (count >= 10) return "⚡";
  if (count >= 5)  return "🔥";
  return "✨";
}
