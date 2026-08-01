/**
 * Shared email builder and per-user data fetcher for the weekly digest.
 * Used by:
 *   • app/api/cron/weekly-digest/route.ts  — bulk Monday send
 *   • lib/job-handlers.ts handleWeeklyDigestEmail — targeted re-delivery
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { getISTNow } from "@/lib/date-utils";
import { APP_URL }   from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestSessionRow {
  id:       string;
  title:    string;
  date:     string;
  time:     string | null;
  location: string;
  venue:    string | null;
}

export interface DigestEventRow {
  id:         string;
  title:      string;
  start_date: string;
  start_time: string | null;
  location:   string;
}

export interface DigestPlanDay {
  type:   string;
  detail: string;
  emoji:  string;
}

export interface CommunityHighlight {
  id:        string;
  user_name: string;
  category:  string;
  title:     string;
}

export interface WeeklyDigestOpts {
  name:              string;
  sessions:          DigestSessionRow[];
  events:            DigestEventRow[];
  rank:              number | null;
  isPremium:         boolean;
  planTitle:         string | null;
  planCoach:         string | null;
  planDays:          DigestPlanDay[] | null;
  attendedThisWeek:  string[];    // titles of sessions attended in the past 7 days
  pointsThisWeek:    number;      // 5 pts × sessions attended
  daysUntilExpiry:   number | null; // null = no warning (> 30 days, or free user)
  communityPosts:    CommunityHighlight[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

// ── Email HTML builder ────────────────────────────────────────────────────────

export function buildWeeklyDigestHTML(opts: WeeklyDigestOpts): string {
  const {
    name, sessions, events, rank, isPremium, planTitle, planCoach, planDays,
    attendedThisWeek, pointsThisWeek, daysUntilExpiry, communityPosts,
  } = opts;
  const base = APP_URL;

  // Activity recap (last 7 days)
  const hasActivity = attendedThisWeek.length > 0 || rank !== null;
  const activityBlock = hasActivity
    ? `<div style="background:#fff8f4;border:1px solid #fde0c8;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#e8620a;font-weight:700;margin-bottom:12px;">Last week's activity</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            ${attendedThisWeek.length > 0 ? `
            <td style="text-align:center;padding:0 8px;">
              <div style="font-size:22px;font-weight:800;color:#e8620a;line-height:1;">${attendedThisWeek.length}</div>
              <div style="font-size:11px;color:#888;margin-top:2px;">session${attendedThisWeek.length !== 1 ? "s" : ""}</div>
            </td>
            <td style="text-align:center;padding:0 8px;border-left:1px solid #fde0c8;">
              <div style="font-size:22px;font-weight:800;color:#e8620a;line-height:1;">+${pointsThisWeek}</div>
              <div style="font-size:11px;color:#888;margin-top:2px;">pts earned</div>
            </td>` : ""}
            ${rank !== null ? `
            <td style="text-align:center;padding:0 8px;${attendedThisWeek.length > 0 ? "border-left:1px solid #fde0c8;" : ""}">
              <div style="font-size:22px;font-weight:800;color:#e8620a;line-height:1;">#${rank}</div>
              <div style="font-size:11px;color:#888;margin-top:2px;">rank</div>
            </td>` : ""}
          </tr>
        </table>
        ${attendedThisWeek.length > 0 ? `
        <div style="font-size:12px;color:#666;margin-top:10px;line-height:1.5;">
          ${attendedThisWeek.slice(0, 3).join(" · ")}${attendedThisWeek.length > 3 ? ` +${attendedThisWeek.length - 3} more` : ""}
        </div>` : ""}
      </div>`
    : "";

  // Membership expiry warning
  const expiryBlock = daysUntilExpiry !== null
    ? `<div style="background:${daysUntilExpiry <= 7 ? "#fff5f5" : "#fffbf0"};border:1px solid ${daysUntilExpiry <= 7 ? "#fca5a5" : "#fde68a"};border-radius:8px;padding:12px 16px;margin-bottom:24px;">
        <div style="font-size:13px;color:${daysUntilExpiry <= 7 ? "#dc2626" : "#d97706"};line-height:1.6;">
          ${daysUntilExpiry <= 7 ? "⚠️" : "🕐"} Your membership expires in <strong>${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""}</strong>.
        </div>
        <a href="${base}/pricing" style="display:inline-block;margin-top:8px;padding:6px 16px;background:${daysUntilExpiry <= 7 ? "#dc2626" : "#d97706"};color:#fff;border-radius:4px;text-decoration:none;font-size:12px;font-weight:700;">Renew Now →</a>
      </div>`
    : "";

  // Upcoming sessions
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

  // Upcoming events
  const eventsBlock = events.length > 0
    ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#e8620a;font-weight:700;margin-bottom:8px;">Upcoming events</div>
       <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
         ${events.map(ev => `
           <tr>
             <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
               <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${ev.title}</div>
               <div style="font-size:12px;color:#666;margin-top:2px;">
                 📅 ${shortDate(ev.start_date)}${ev.start_time ? ` · ${ev.start_time}` : ""}
                 &nbsp;·&nbsp;📍 ${ev.location}
               </div>
             </td>
             <td style="padding:10px 0 10px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle;">
               <a href="${base}/events" style="font-size:12px;font-weight:700;color:#e8620a;text-decoration:none;white-space:nowrap;">
                 View →
               </a>
             </td>
           </tr>
         `).join("")}
       </table>`
    : "";

  // Training plan (premium) or upgrade prompt (free)
  const planBlock = isPremium && planTitle && planDays
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="padding-bottom:10px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#e8620a;font-weight:700;">Your plan this week</div>
          <div style="font-size:13px;font-weight:600;color:#0a0a0a;margin-top:2px;">${planTitle}${planCoach ? ` — by ${planCoach}` : ""}</div>
        </td></tr>
        <tr><td>
          ${planDays.map((d, i) => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f5f5f5;">
              <span style="font-size:13px;flex-shrink:0;">${d.emoji}</span>
              <div>
                <span style="font-size:12px;font-weight:600;color:#0a0a0a;">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i] ?? `Day ${i+1}`}: ${d.type}</span>
                ${d.detail ? `<div style="font-size:11px;color:#666;margin-top:1px;">${d.detail}</div>` : ""}
              </div>
            </div>
          `).join("")}
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

  // Community highlights
  const communityBlock = communityPosts.length > 0
    ? `<div style="margin-bottom:24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#e8620a;font-weight:700;margin-bottom:10px;">Community highlights</div>
        ${communityPosts.map(p => `
          <div style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <div style="font-size:11px;color:#e8620a;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">${p.category}</div>
            <div style="font-size:13px;font-weight:600;color:#0a0a0a;margin-top:2px;">${p.title}</div>
            <div style="font-size:11px;color:#aaa;margin-top:2px;">by ${p.user_name}</div>
          </div>
        `).join("")}
        <div style="margin-top:10px;">
          <a href="${base}/community" style="font-size:12px;font-weight:700;color:#e8620a;text-decoration:none;">View all →</a>
        </div>
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
          Here's your Connected Steps week. Let's make it count.
        </p>

        ${activityBlock}
        ${expiryBlock}

        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#e8620a;font-weight:700;margin-bottom:8px;">
          This week's sessions
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          ${sessionRows}
        </table>

        ${eventsBlock}
        ${planBlock}
        ${communityBlock}

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

// ── Per-user data fetch (for job handler re-delivery) ─────────────────────────

export interface PerUserDigestData {
  firstName:        string;
  sessions:         DigestSessionRow[];
  events:           DigestEventRow[];
  rank:             number | null;
  isPremium:        boolean;
  planTitle:        string | null;
  planCoach:        string | null;
  planDays:         DigestPlanDay[] | null;
  attendedThisWeek: string[];
  pointsThisWeek:   number;
  daysUntilExpiry:  number | null;
  communityPosts:   CommunityHighlight[];
  unsubUrl:         string;
}

export async function fetchWeeklyDigestDataForUser(userEmail: string): Promise<PerUserDigestData | null> {
  const db  = getSupabaseServer();
  const now               = new Date();
  const todayIST          = getISTNow();
  const todayStr          = todayIST.toISOString().slice(0, 10);
  const weekEndStr        = new Date(todayIST.getTime() +  7 * 86400_000).toISOString().slice(0, 10);
  const twoWeeksEndStr    = new Date(todayIST.getTime() + 14 * 86400_000).toISOString().slice(0, 10);
  const pastWeekStartStr  = new Date(todayIST.getTime() -  7 * 86400_000).toISOString().slice(0, 10);
  const yesterdayStr      = new Date(todayIST.getTime() -      86400_000).toISOString().slice(0, 10);
  const monthKey          = `${todayIST.getUTCFullYear()}-${String(todayIST.getUTCMonth() + 1).padStart(2, "0")}`;
  const email             = userEmail.toLowerCase();
  const base              = APP_URL;

  // Fetch most data in parallel
  const [userRes, lbRes, membershipRes, sessionsRes, eventsRes, communityRes] = await Promise.all([
    db.from("users").select("first_name").eq("email", email).maybeSingle(),
    db.from("leaderboard").select("user_email, month_points").eq("points_month", monthKey),
    db.from("memberships").select("expires_at").eq("status", "active").eq("user_email", email).gt("expires_at", now.toISOString()).maybeSingle(),
    db.from("sessions").select("id, title, date, time, location, venue").gte("date", todayStr).lte("date", weekEndStr).order("date"),
    db.from("events").select("id, title, start_date, start_time, location").eq("status", "published").gte("start_date", todayStr).lte("start_date", twoWeeksEndStr).order("start_date").limit(3),
    db.from("community_posts").select("id, user_name, category, title").eq("approved", true).order("created_at", { ascending: false }).limit(3),
  ]);

  if (!userRes.data) return null;

  // Leaderboard rank
  const allLb = (lbRes.data ?? []) as { user_email: string; month_points: number }[];
  const sorted = [...allLb].sort((a, b) => (b.month_points ?? 0) - (a.month_points ?? 0));
  const rankIdx = sorted.findIndex(r => r.user_email.toLowerCase() === email);
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;

  // Premium + expiry
  const membership = membershipRes.data;
  const isPremium  = !!membership;
  const daysUntilExpiry = membership
    ? Math.ceil((new Date(membership.expires_at).getTime() - now.getTime()) / 86400_000)
    : null;

  // Training plan (premium only)
  let planTitle: string | null = null;
  let planCoach: string | null = null;
  let planDays: DigestPlanDay[] | null = null;
  if (isPremium) {
    const { data: plan } = await db
      .from("training_plans")
      .select("title, coach_name, days")
      .eq("active", true)
      .eq("user_email", email)
      .maybeSingle();
    if (plan) {
      planTitle = plan.title as string;
      planCoach = plan.coach_name as string | null;
      planDays  = Array.isArray(plan.days) ? plan.days as DigestPlanDay[] : null;
    }
  }

  // Past-week attendance
  const { data: pastSessions } = await db
    .from("sessions")
    .select("id, title")
    .gte("date", pastWeekStartStr)
    .lte("date", yesterdayStr);
  const pastSessionIds     = (pastSessions ?? []).map(s => s.id as string);
  const pastSessionTitleMap = new Map((pastSessions ?? []).map(s => [s.id as string, s.title as string]));
  const attendedThisWeek: string[] = [];
  if (pastSessionIds.length > 0) {
    const { data: att } = await db
      .from("session_attendance")
      .select("session_id")
      .in("session_id", pastSessionIds)
      .eq("user_email", email)
      .eq("attended", true);
    for (const a of att ?? []) {
      const title = pastSessionTitleMap.get(a.session_id as string);
      if (title) attendedThisWeek.push(title);
    }
  }

  return {
    firstName:        (userRes.data.first_name as string | null) || "there",
    sessions:         (sessionsRes.data ?? []) as DigestSessionRow[],
    events:           (eventsRes.data ?? []) as DigestEventRow[],
    rank,
    isPremium,
    planTitle,
    planCoach,
    planDays,
    attendedThisWeek,
    pointsThisWeek:   attendedThisWeek.length * 5,
    daysUntilExpiry:  daysUntilExpiry !== null && daysUntilExpiry <= 30 ? daysUntilExpiry : null,
    communityPosts:   (communityRes.data ?? []) as CommunityHighlight[],
    unsubUrl:         `${base}/api/unsubscribe?email=${encodeURIComponent(email)}`,
  };
}
