// Cron: every Monday at 7am IST (01:30 UTC)
// Sends each user a personalised weekly digest:
//   Free users:    upcoming sessions this week + leaderboard rank
//   Premium users: above + training plan summary for the week
//
// Channels: in-app notification (always) + email via Resend (if configured)
//
// WhatsApp template spec (register in MSG91 when ready):
//   Name:     weekly_digest
//   Category: Utility
//   Body:
//     Hi {{1}}! 👋 Here's your Connected Steps week ahead:
//     📅 {{2}}
//     🏆 Your rank: #{{3}}
//     {{4}}
//     Keep running! — Connected Steps Team
//   {{1}} = first name
//   {{2}} = session list (e.g. "Saturday Long Run · Sat 14 Jun, 6am")
//   {{3}} = leaderboard rank number
//   {{4}} = training plan summary (premium) or "Upgrade for a personalised plan →" (free)
//
// Add to vercel.json:
// { "path": "/api/cron/weekly-digest", "schedule": "30 1 * * 1" }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotifications } from "@/lib/notify-inapp";
import { paginateAll } from "@/lib/paginate";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserRow {
  email:      string;
  first_name: string;
  last_name:  string;
  phone:      string | null;
}

interface SessionRow {
  id:       string;
  title:    string;
  date:     string;
  time:     string | null;
  location: string;
  venue:    string | null;
}

interface PlanDay {
  type:   string;
  detail: string;
  emoji:  string;
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

// ── Email HTML builders ───────────────────────────────────────────────────────

function buildDigestEmail(opts: {
  name:       string;
  sessions:   SessionRow[];
  rank:       number | null;
  isPremium:  boolean;
  planTitle:  string | null;
  planCoach:  string | null;
  planDays:   PlanDay[] | null;
}): string {
  const { name, sessions, rank, isPremium, planTitle, planCoach, planDays } = opts;
  const base = appUrl();

  const sessionRows = sessions.length > 0
    ? sessions.map(s => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${s.title}</div>
            <div style="font-size:12px;color:#666;margin-top:2px;">
              📅 ${shortDate(s.date)}${s.time ? ` · ${s.time}` : ""}
              &nbsp;·&nbsp;📍 ${s.venue ?? s.location}
            </div>
          </td>
          <td style="padding:10px 0 10px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle;">
            <a href="${base}/join/${s.id}" style="font-size:12px;font-weight:700;color:#e8620a;text-decoration:none;white-space:nowrap;">
              Register →
            </a>
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="2" style="padding:14px 0;font-size:13px;color:#999;font-style:italic;">
        No sessions scheduled this week — check back soon.
       </td></tr>`;

  const rankBlock = rank !== null
    ? `<div style="display:inline-flex;align-items:center;gap:8px;background:#fff8f4;border:1px solid #fde0c8;border-radius:8px;padding:10px 16px;margin-bottom:24px;">
        <span style="font-size:18px;">🏆</span>
        <div>
          <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Your rank this month</div>
          <div style="font-size:20px;font-weight:800;color:#e8620a;line-height:1.1;">#${rank}</div>
        </div>
       </div>`
    : "";

  const planBlock = isPremium && planTitle && planDays
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="padding-bottom:10px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#e8620a;font-weight:700;">Your plan this week</div>
          <div style="font-size:13px;font-weight:600;color:#0a0a0a;margin-top:2px;">${planTitle}${planCoach ? ` — by ${planCoach}` : ""}</div>
        </td></tr>
        <tr><td>
          <div style="display:grid;gap:4px;">
            ${planDays.map((d, i) => `
              <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f5f5f5;">
                <span style="font-size:13px;flex-shrink:0;margin-top:1px;">${d.emoji}</span>
                <div>
                  <span style="font-size:12px;font-weight:600;color:#0a0a0a;">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i] ?? `Day ${i+1}`}: ${d.type}</span>
                  ${d.detail ? `<div style="font-size:11px;color:#666;margin-top:1px;">${d.detail}</div>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </td></tr>
      </table>`
    : !isPremium
    ? `<div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:14px 18px;margin-bottom:24px;text-align:center;">
        <div style="font-size:13px;color:#555;margin-bottom:8px;">Get a personalised training plan from your coach — updated every week.</div>
        <a href="${base}/pricing" style="display:inline-block;padding:8px 20px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;">
          Upgrade to Premium →
        </a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07);">

      <!-- Header -->
      <tr><td style="background:#0a0a0a;padding:20px 32px;">
        <div style="font-size:18px;font-weight:700;color:#fff;">Connected Steps</div>
        <div style="font-size:10px;color:#e8620a;letter-spacing:0.14em;text-transform:uppercase;margin-top:2px;">Weekly Digest</div>
      </td></tr>
      <tr><td style="height:3px;background:#e8620a;"></td></tr>

      <!-- Body -->
      <tr><td style="padding:28px 32px 8px;">
        <p style="margin:0 0 6px;font-size:15px;color:#333;">Hi <strong>${name}</strong> 👋</p>
        <p style="margin:0 0 22px;font-size:14px;color:#666;line-height:1.6;">
          Here's your Connected Steps week ahead. Let's make it count.
        </p>

        ${rankBlock}

        <!-- Sessions -->
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#e8620a;font-weight:700;margin-bottom:8px;">
          This week's sessions
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          ${sessionRows}
        </table>

        ${planBlock}

        <!-- Footer CTA -->
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
          <tr><td style="background:#e8620a;border-radius:6px;">
            <a href="${base}/dashboard" style="display:block;padding:11px 32px;font-size:13px;font-weight:700;color:#fff;text-decoration:none;">
              Open Dashboard →
            </a>
          </td></tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:14px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#aaa;">
          Connected Steps · Hyderabad ·
          <a href="${base}" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
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

  // ── Phase 1: fetch all data (no lock held) ─────────────────────────────────
  // All paginateAll / DB reads happen before the lock is acquired.  A transient
  // DB error here returns 500 with no lock committed, so Vercel retries cleanly.

  // Week window: today → 7 days out (IST: UTC+5:30)
  const todayIST   = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const todayStr   = todayIST.toISOString().slice(0, 10);
  const weekEndIST = new Date(todayIST.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekEndStr = weekEndIST.toISOString().slice(0, 10);

  // ── 1. Fetch all data — paginated to handle 1000+ rows at scale ─────────────
  // users, leaderboard, memberships run in parallel; each paginates internally.
  // sessions is bounded by the week window — no pagination needed.

  const [usersResult, leaderboardResult, membershipsResult, sessionsRes] = await Promise.all([
    paginateAll<UserRow>((from, to) =>
      db.from("users").select("email, first_name, last_name, phone").order("email").range(from, to)
    ),
    paginateAll<{ user_email: string; month_points: number }>((from, to) =>
      db.from("leaderboard").select("user_email, month_points").order("user_email").range(from, to)
    ),
    paginateAll<{ user_email: string }>((from, to) =>
      db.from("memberships").select("user_email").eq("status", "active").gt("expires_at", now.toISOString()).order("user_email").range(from, to)
    ),
    db.from("sessions")
      .select("id, title, date, time, location, venue")
      .gte("date", todayStr)
      .lte("date", weekEndStr)
      .order("date"),
  ]);

  const users       = usersResult.rows;
  const leaderboard = leaderboardResult.rows;
  const premiumSet  = new Set(membershipsResult.rows.map(m => m.user_email.toLowerCase()));
  const sessions    = (sessionsRes.data ?? []) as SessionRow[];

  if (!users.length) {
    return NextResponse.json({ message: "No users", sent: 0 });  // no lock needed
  }

  // ── 2. Compute leaderboard ranks ────────────────────────────────────────────
  // Sort descending, assign rank with ties
  const sorted = [...leaderboard].sort((a, b) => b.month_points - a.month_points);
  const rankMap = new Map<string, number>();
  sorted.forEach((row, i) => rankMap.set(row.user_email.toLowerCase(), i + 1));

  // ── 3. Fetch training plans for premium users ───────────────────────────────
  const premiumEmails = users.map(u => u.email.toLowerCase()).filter(e => premiumSet.has(e));
  const plansMap = new Map<string, { title: string; coach_name: string; days: PlanDay[] }>();

  if (premiumEmails.length > 0) {
    // Fetch all active plans — avoids large IN() clause at scale
    const { rows: allPlans } = await paginateAll<{ user_email: string; title: string; coach_name: string; days: PlanDay[] }>(
      (from, to) =>
        db.from("training_plans").select("user_email, title, coach_name, days").eq("active", true).order("user_email").range(from, to)
    );

    const premiumSet2 = new Set(premiumEmails);
    for (const p of allPlans) {
      if (!premiumSet2.has(p.user_email.toLowerCase())) continue;
      plansMap.set(p.user_email.toLowerCase(), {
        title:      p.title,
        coach_name: p.coach_name,
        days:       Array.isArray(p.days) ? p.days : [],
      });
    }
  }

  // ── 4. Send notifications + emails ─────────────────────────────────────────

  const notifUsers: { email: string }[] = [];
  type EmailJob = { from: string; to: string[]; subject: string; html: string };
  const emailBatch: EmailJob[] = [];

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Connected Steps <noreply@connectedsteps.in>";

  for (const user of users) {
    const email     = user.email.toLowerCase();
    const firstName = user.first_name || "there";
    const isPremium = premiumSet.has(email);
    const rank      = rankMap.get(email) ?? null;
    const plan      = plansMap.get(email) ?? null;

    // Build notification body (concise, for the bell)
    const sessionLine = sessions.length > 0
      ? `${sessions.length} session${sessions.length > 1 ? "s" : ""} this week — ${sessions.map(s => s.title).join(", ")}.`
      : "No sessions scheduled this week.";
    const rankLine  = rank !== null ? ` Your rank: #${rank}.` : "";
    const planLine  = isPremium && plan ? ` Plan: ${plan.title}.` : "";

    notifUsers.push({ email });

    // Queue email (built per-user — different for free vs premium)
    emailBatch.push({
      from:    fromEmail,
      to:      [email],
      subject: `Your Connected Steps week — ${shortDate(todayStr)}`,
      html:    buildDigestEmail({
        name:      firstName,
        sessions,
        rank,
        isPremium,
        planTitle: plan?.title  ?? null,
        planCoach: plan?.coach_name ?? null,
        planDays:  plan?.days   ?? null,
      }),
    });

    void sessionLine; void rankLine; void planLine; // used in notification body below
  }

  // No users at all — return without acquiring the lock.
  if (!notifUsers.length) {
    return NextResponse.json({ message: "No users", sent: 0 });
  }

  // ── Phase 2: acquire lock ──────────────────────────────────────────────────
  // Lock is acquired only after all data is ready.  A concurrent duplicate
  // invocation will hit a 23505 here and return {skipped: true}.
  const acquired = await acquireCronLock("weekly-digest", executionDate);
  if (!acquired) {
    console.log(`[weekly-digest] already ran for ${executionDate} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: executionDate });
  }

  // ── Phase 3: send (lock held) ──────────────────────────────────────────────
  // Wrapped in try/catch: execution failure releases the lock so the Vercel
  // retry can re-acquire and re-attempt.  An already-sent-today filter removes
  // users who received a digest in a prior partial run, preventing duplicates.
  try {
    // Filter users who were already sent a digest today (retry safety).
    const dayStart = executionDate + "T00:00:00.000Z";
    const { data: alreadySentRows } = await db
      .from("notifications")
      .select("user_email")
      .eq("type", "weekly_digest")
      .in("user_email", notifUsers.map(u => u.email))
      .gte("created_at", dayStart);

    const alreadySentSet = new Set((alreadySentRows ?? []).map(n => n.user_email.toLowerCase()));
    const freshNotifUsers = notifUsers.filter(u => !alreadySentSet.has(u.email.toLowerCase()));
    const freshEmailBatch = emailBatch.filter(e => !alreadySentSet.has(e.to[0]?.toLowerCase() ?? ""));

    if (!freshNotifUsers.length) {
      // All users already notified in a prior partial run — idempotent success.
      console.log(`[weekly-digest] all ${notifUsers.length} users already notified today — complete`);
      return NextResponse.json({ ok: true, users: users.length, notified: 0, email_sent: 0, email_failed: 0 });
    }

    // ── 5. Batch in-app notifications ─────────────────────────────────────────
    const sessionSummary = sessions.length > 0
      ? `${sessions.length} session${sessions.length > 1 ? "s" : ""} this week: ${sessions.map(s => s.title).slice(0, 2).join(", ")}${sessions.length > 2 ? "…" : ""}.`
      : "No sessions this week.";

    await createNotifications(
      freshNotifUsers,
      "weekly_digest",
      "Your week at Connected Steps 🏃",
      sessionSummary,
      "/profile",
    );

    // ── 6. Send emails via Resend batch API (max 100 per request) ─────────────
    let emailSent = 0, emailFailed = 0;

    if (freshEmailBatch.length > 0) {
      const { sendBatchEmails } = await import("@/lib/email-service");
      const { sent, failed } = await sendBatchEmails(freshEmailBatch);
      emailSent   = sent;
      emailFailed = failed;
    }

    console.log(
      `[weekly-digest] users=${users.length} pages_users=${usersResult.pages}` +
      ` pages_lb=${leaderboardResult.pages} pages_mem=${membershipsResult.pages}` +
      ` sessions=${sessions.length} premium=${premiumEmails.length}` +
      ` notified=${freshNotifUsers.length} skipped_already_sent=${alreadySentSet.size}` +
      ` email_sent=${emailSent} email_failed=${emailFailed}` +
      ` duration=${Date.now() - startMs}ms`,
    );

    return NextResponse.json({
      ok:                 true,
      users:              users.length,
      sessions_this_week: sessions.length,
      premium_users:      premiumEmails.length,
      notified:           freshNotifUsers.length,
      email_sent:         emailSent,
      email_failed:       emailFailed,
    });

  } catch (err: unknown) {
    await releaseCronLock("weekly-digest", executionDate);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-digest] send error (lock released):", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
