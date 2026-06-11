// Cron: daily at 8am IST (02:30 UTC)
// Finds users whose streak is >= 3 but who haven't attended in 10+ days,
// and sends them an in-app notification to nudge them back.
//
// Add to vercel.json:
// { "path": "/api/cron/streak-at-risk", "schedule": "30 2 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notify-inapp";
import { calcDateGapStreak, SESSION_GAP_DAYS } from "@/lib/streak-utils";
import { paginateAll } from "@/lib/paginate";
import { acquireCronLock } from "@/lib/cron-lock";

const MAX_GAP_DAYS  = SESSION_GAP_DAYS;
const MIN_STREAK    = 3;
const INACTIVE_DAYS = 10;
// Don't re-notify the same user within this many days.
const COOLDOWN_DAYS = 7;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const db  = getSupabaseServer();
  const now = new Date();

  // Execution-protection: one run per calendar day (UTC).
  const executionDate = now.toISOString().slice(0, 10);
  const acquired = await acquireCronLock("streak-at-risk", executionDate);
  if (!acquired) {
    console.log(`[streak-at-risk] already ran for ${executionDate} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: executionDate });
  }

  // ── 1. Fetch all attended sessions with their dates ───────────────────────
  // Paginated: session_attendance can exceed the default row limit at scale.
  let attPages = 0;
  let rows: { user_email: string; sessions: unknown }[];
  try {
    const result = await paginateAll(
      (from, to) => db
        .from("session_attendance")
        .select("user_email, sessions!inner(date)")
        .eq("attended", true)
        .order("user_email")
        .range(from, to),
    );
    rows    = result.rows as typeof rows;
    attPages = result.pages;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[streak-at-risk] query error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!rows.length) {
    console.log(`[streak-at-risk] no attendance records found duration=${Date.now() - startMs}ms`);
    return NextResponse.json({ message: "No attendance records found", notified: 0 });
  }

  // ── 2. Group dates by user ────────────────────────────────────────────────
  const userDates = new Map<string, Date[]>();
  for (const row of rows) {
    const session = row.sessions as { date: string } | null;
    if (!session?.date) continue;
    const d = new Date(session.date + "T00:00:00Z");
    if (isNaN(d.getTime())) continue;
    const email = row.user_email.toLowerCase();
    if (!userDates.has(email)) userDates.set(email, []);
    userDates.get(email)!.push(d);
  }

  // ── 3. Calculate streak and last-attended for each user ───────────────────
  type UserStat = { streak: number; lastAttended: Date };
  const stats = new Map<string, UserStat>();

  for (const [email, dates] of userDates) {
    dates.sort((a, b) => b.getTime() - a.getTime());
    const streak = calcDateGapStreak(dates, MAX_GAP_DAYS);
    stats.set(email, { streak, lastAttended: dates[0] });
  }

  // ── 4. Filter: streak >= MIN_STREAK and inactive for INACTIVE_DAYS+ ──────
  const atRisk: { email: string; streak: number; daysSince: number }[] = [];
  for (const [email, { streak, lastAttended }] of stats) {
    if (streak < MIN_STREAK) continue;
    const daysSince = (now.getTime() - lastAttended.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= INACTIVE_DAYS) {
      atRisk.push({ email, streak, daysSince: Math.floor(daysSince) });
    }
  }

  if (!atRisk.length) {
    console.log(`[streak-at-risk] rows=${rows.length} pages=${attPages} users=${userDates.size} at_risk=0 duration=${Date.now() - startMs}ms`);
    return NextResponse.json({ message: "No at-risk streaks today", notified: 0 });
  }

  // ── 5. Dedup: skip users notified within the cooldown window ─────────────
  const cooldownCutoff = new Date(now.getTime() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const atRiskEmails   = atRisk.map(u => u.email);

  const { data: recentNotifs } = await db
    .from("notifications")
    .select("user_email")
    .eq("type", "streak_at_risk")
    .in("user_email", atRiskEmails)
    .gte("created_at", cooldownCutoff.toISOString());

  const alreadyNotified = new Set((recentNotifs ?? []).map(n => n.user_email.toLowerCase()));
  const toNotify = atRisk.filter(u => !alreadyNotified.has(u.email));

  // ── 6. Send notifications ─────────────────────────────────────────────────
  const results: { email: string; streak: number; ok: boolean }[] = [];

  for (const user of toNotify) {
    const id = await createNotification({
      user_email: user.email,
      type:       "streak_at_risk",
      title:      "Your streak is at risk 🔥",
      body:       `Your ${user.streak}-session streak is at risk. Join the next session to keep it alive.`,
      action_url: "/dashboard",
    }).catch(() => null);

    results.push({ email: user.email, streak: user.streak, ok: id !== null });
  }

  const sent = results.filter(r => r.ok).length;
  console.log(
    `[streak-at-risk] rows=${rows.length} pages=${attPages} users=${userDates.size}` +
    ` at_risk=${atRisk.length} skipped=${alreadyNotified.size} sent=${sent}` +
    ` duration=${Date.now() - startMs}ms`,
  );

  return NextResponse.json({
    at_risk:  atRisk.length,
    skipped:  alreadyNotified.size,
    notified: sent,
    results,
  });
}
