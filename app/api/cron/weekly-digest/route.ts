// Cron: every Monday at 7:00 AM IST (01:30 UTC)
// Sends each active user a personalised weekly digest email.
//
// vercel.json entry:
// { "path": "/api/cron/weekly-digest", "schedule": "30 1 * * 1" }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotifications } from "@/lib/notify-inapp";
import { paginateAll } from "@/lib/paginate";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import {
  buildWeeklyDigestHTML,
  type DigestSessionRow,
  type DigestEventRow,
  type DigestPlanDay,
  type CommunityHighlight,
} from "@/lib/weekly-digest-email";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserRow {
  email:      string;
  first_name: string;
  last_name:  string;
  phone:      string | null;
}

interface MembershipRow {
  user_email: string;
  expires_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
}

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const db  = getSupabaseServer();
  const now = new Date();
  const executionDate = now.toISOString().slice(0, 10);

  // ── Time windows ──────────────────────────────────────────────────────────
  const todayIST         = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const todayStr         = todayIST.toISOString().slice(0, 10);
  const weekEndStr       = new Date(todayIST.getTime() +  7 * 86400_000).toISOString().slice(0, 10);
  const twoWeeksEndStr   = new Date(todayIST.getTime() + 14 * 86400_000).toISOString().slice(0, 10);
  const pastWeekStartStr = new Date(todayIST.getTime() -  7 * 86400_000).toISOString().slice(0, 10);
  const yesterdayStr     = new Date(todayIST.getTime() -      86400_000).toISOString().slice(0, 10);
  const monthKey         = `${todayIST.getUTCFullYear()}-${String(todayIST.getUTCMonth() + 1).padStart(2, "0")}`;

  console.log(`[weekly-digest] starting date=${todayStr} (UTC exec=${executionDate})`);

  // ── Phase 1: fetch all bulk data (before lock) ────────────────────────────
  const [
    usersResult,
    leaderboardResult,
    membershipsResult,
    sessionsRes,
    eventsRes,
    communityRes,
    suppressionRes,
  ] = await Promise.all([
    // Active users only, email must be set
    paginateAll<UserRow>((from, to) =>
      db.from("users")
        .select("email, first_name, last_name, phone")
        .eq("is_active", true)
        .not("email", "is", null)
        .order("email")
        .range(from, to)
    ),
    // Leaderboard for rank calculation
    paginateAll<{ user_email: string; month_points: number }>((from, to) =>
      db.from("leaderboard")
        .select("user_email, month_points")
        .eq("points_month", monthKey)
        .order("user_email")
        .range(from, to)
    ),
    // Active memberships with expiry dates
    paginateAll<MembershipRow>((from, to) =>
      db.from("memberships")
        .select("user_email, expires_at")
        .eq("status", "active")
        .gt("expires_at", now.toISOString())
        .order("user_email")
        .range(from, to)
    ),
    // Upcoming sessions this week
    db.from("sessions")
      .select("id, title, date, time, location, venue")
      .gte("date", todayStr)
      .lte("date", weekEndStr)
      .order("date"),
    // Upcoming events in next 2 weeks
    db.from("events")
      .select("id, title, start_date, start_time, location")
      .eq("status", "published")
      .gte("start_date", todayStr)
      .lte("start_date", twoWeeksEndStr)
      .order("start_date")
      .limit(4),
    // Community highlights (same for all users)
    db.from("community_posts")
      .select("id, user_name, category, title")
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(3),
    // Suppressed emails (unsubscribed users)
    db.from("email_suppression").select("email"),
  ]);

  const users          = usersResult.rows;
  const leaderboard    = leaderboardResult.rows;
  const memberships    = membershipsResult.rows;
  const sessions       = (sessionsRes.data   ?? []) as DigestSessionRow[];
  const upcomingEvents = (eventsRes.data     ?? []) as DigestEventRow[];
  const communityPosts = (communityRes.data  ?? []) as CommunityHighlight[];
  const suppressionSet = new Set((suppressionRes.data ?? []).map(r => (r.email as string).toLowerCase()));

  console.log(
    `[weekly-digest] data fetched users=${users.length} lb=${leaderboard.length}` +
    ` memberships=${memberships.length} sessions=${sessions.length}` +
    ` events=${upcomingEvents.length} suppressed=${suppressionSet.size}`
  );

  if (!users.length) {
    return NextResponse.json({ message: "No active users", sent: 0 });
  }

  // ── Past-week attendance (sequential: needs session IDs first) ────────────
  const { data: pastSessionData } = await db
    .from("sessions")
    .select("id, title")
    .gte("date", pastWeekStartStr)
    .lte("date", yesterdayStr);

  const pastSessions   = pastSessionData ?? [];
  const pastSessionIds = pastSessions.map(s => s.id as string);
  const pastTitleMap   = new Map(pastSessions.map(s => [s.id as string, s.title as string]));

  const attendanceByEmail = new Map<string, string[]>();
  if (pastSessionIds.length > 0) {
    const { data: attData } = await db
      .from("session_attendance")
      .select("user_email, session_id")
      .in("session_id", pastSessionIds)
      .eq("attended", true);
    for (const a of attData ?? []) {
      const email = (a.user_email as string).toLowerCase();
      if (!attendanceByEmail.has(email)) attendanceByEmail.set(email, []);
      const title = pastTitleMap.get(a.session_id as string);
      if (title) attendanceByEmail.get(email)!.push(title);
    }
  }

  console.log(
    `[weekly-digest] past-week: sessions=${pastSessions.length}` +
    ` users_with_attendance=${attendanceByEmail.size}`
  );

  // ── Derived maps ──────────────────────────────────────────────────────────

  // Leaderboard rank (sorted descending by month_points)
  const sorted = [...leaderboard].sort((a, b) => (b.month_points ?? 0) - (a.month_points ?? 0));
  const rankMap = new Map<string, number>(sorted.map((r, i) => [r.user_email.toLowerCase(), i + 1]));

  // Premium set + expiry map
  const membershipExpiryMap = new Map<string, string>(
    memberships.map(m => [m.user_email.toLowerCase(), m.expires_at])
  );

  // Training plans for premium users
  const premiumEmails = users
    .map(u => u.email.toLowerCase())
    .filter(e => membershipExpiryMap.has(e));
  const plansMap = new Map<string, { title: string; coach_name: string | null; days: DigestPlanDay[] }>();

  if (premiumEmails.length > 0) {
    const { rows: allPlans } = await paginateAll<{
      user_email: string; title: string; coach_name: string; days: DigestPlanDay[]
    }>((from, to) =>
      db.from("training_plans")
        .select("user_email, title, coach_name, days")
        .eq("active", true)
        .order("user_email")
        .range(from, to)
    );
    const premiumSet2 = new Set(premiumEmails);
    for (const p of allPlans) {
      if (!premiumSet2.has(p.user_email.toLowerCase())) continue;
      plansMap.set(p.user_email.toLowerCase(), {
        title:      p.title,
        coach_name: p.coach_name ?? null,
        days:       Array.isArray(p.days) ? p.days : [],
      });
    }
  }

  // ── Phase 2: acquire cron lock ────────────────────────────────────────────
  const acquired = await acquireCronLock("weekly-digest", executionDate);
  if (!acquired) {
    console.log(`[weekly-digest] already ran for ${executionDate} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: executionDate });
  }

  // ── Phase 3: build + send (lock held) ────────────────────────────────────
  try {
    // Retry safety: exclude users already notified today
    const dayStart = executionDate + "T00:00:00.000Z";
    const { data: alreadySentRows } = await db
      .from("notifications")
      .select("user_email")
      .eq("type", "weekly_digest")
      .in("user_email", users.map(u => u.email))
      .gte("created_at", dayStart);
    const alreadySentSet = new Set((alreadySentRows ?? []).map(n => n.user_email.toLowerCase()));

    // Build per-user email batches
    const fromEmail    = `${process.env.ZEPTOMAIL_FROM_NAME ?? "Connected Steps"} <${process.env.ZEPTOMAIL_FROM_EMAIL ?? "info@connectedsteps.in"}>`;
    const base         = appUrl();
    const notifUsers:  { email: string }[] = [];
    const emailBatch:  { from: string; to: string[]; subject: string; html: string; listUnsubscribeUrl?: string }[] = [];
    let   skippedAlreadySent = 0;
    let   skippedSuppressed  = 0;

    for (const user of users) {
      const email     = user.email.toLowerCase();
      const firstName = user.first_name || "there";

      if (alreadySentSet.has(email)) { skippedAlreadySent++; continue; }
      if (suppressionSet.has(email)) { skippedSuppressed++;  continue; }

      const isPremium     = membershipExpiryMap.has(email);
      const rank          = rankMap.get(email) ?? null;
      const plan          = plansMap.get(email) ?? null;
      const attended      = attendanceByEmail.get(email) ?? [];
      const expiresAt     = membershipExpiryMap.get(email) ?? null;
      const daysLeft      = expiresAt
        ? Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86400_000)
        : null;

      notifUsers.push({ email });

      emailBatch.push({
        from:               fromEmail,
        to:                 [email],
        subject:            `Your Connected Steps week — ${shortDate(todayStr)}`,
        listUnsubscribeUrl: `${base}/api/unsubscribe?email=${encodeURIComponent(email)}`,
        html: buildWeeklyDigestHTML({
          name:             firstName,
          sessions,
          events:           upcomingEvents,
          rank,
          isPremium,
          planTitle:        plan?.title      ?? null,
          planCoach:        plan?.coach_name ?? null,
          planDays:         plan?.days       ?? null,
          attendedThisWeek: attended,
          pointsThisWeek:   attended.length * 5,
          daysUntilExpiry:  daysLeft !== null && daysLeft <= 30 ? daysLeft : null,
          communityPosts,
        }),
      });
    }

    if (!notifUsers.length) {
      console.log(`[weekly-digest] no new users to notify (skipped already_sent=${skippedAlreadySent} suppressed=${skippedSuppressed})`);
      return NextResponse.json({ ok: true, users: users.length, notified: 0, email_sent: 0, email_failed: 0 });
    }

    // In-app notifications
    const sessionSummary = sessions.length > 0
      ? `${sessions.length} session${sessions.length > 1 ? "s" : ""} this week: ${sessions.map(s => s.title).slice(0, 2).join(", ")}${sessions.length > 2 ? "…" : ""}.`
      : "No sessions this week.";

    await createNotifications(
      notifUsers,
      "weekly_digest",
      "Your week at Connected Steps 🏃",
      sessionSummary,
      "/profile",
    );

    // Batch email send via ZeptoMail
    let emailSent = 0, emailFailed = 0;
    if (emailBatch.length > 0) {
      const { sendBatchEmails } = await import("@/lib/email-service");
      const result = await sendBatchEmails(emailBatch);
      emailSent   = result.sent;
      emailFailed = result.failed;

      // Log failed deliveries
      for (const r of result.results) {
        if (!r.ok) {
          console.error(`[weekly-digest] email FAILED to=${r.to} error="${r.error ?? "unknown"}" category=${r.errorCategory ?? "?"}`);
        }
      }
    }

    console.log(
      `[weekly-digest] complete date=${todayStr}` +
      ` users_total=${users.length} users_active=${notifUsers.length}` +
      ` skipped_already_sent=${skippedAlreadySent} skipped_suppressed=${skippedSuppressed}` +
      ` sessions_upcoming=${sessions.length} events_upcoming=${upcomingEvents.length}` +
      ` premium_users=${premiumEmails.length} past_sessions=${pastSessions.length}` +
      ` email_sent=${emailSent} email_failed=${emailFailed}` +
      ` duration=${Date.now() - startMs}ms`
    );

    return NextResponse.json({
      ok:                  true,
      date:                todayStr,
      users_total:         users.length,
      users_notified:      notifUsers.length,
      skipped_already_sent: skippedAlreadySent,
      skipped_suppressed:   skippedSuppressed,
      sessions_upcoming:   sessions.length,
      events_upcoming:     upcomingEvents.length,
      premium_users:       premiumEmails.length,
      email_sent:          emailSent,
      email_failed:        emailFailed,
      duration_ms:         Date.now() - startMs,
    });

  } catch (err: unknown) {
    await releaseCronLock("weekly-digest", executionDate);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-digest] error (lock released):", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
