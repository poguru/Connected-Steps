// Cron: 45 1 * * * (1:45 AM UTC = 7:15 AM IST)
// Sends a single daily attendance + system summary to info@connectedsteps.in.
//
// vercel.json entry:
// { "path": "/api/cron/daily-attendance-report", "schedule": "45 1 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";

const REPORT_TO      = "info@connectedsteps.in";
const REPORT_TO_NAME = "Connected Steps Admin";
const IST_OFFSET_MS  = 5.5 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionRow {
  id:       string;
  title:    string;
  location: string;
  time:     string | null;
  attendees: { email: string; name: string | null; attended: boolean }[];
}

interface LeaderboardRow {
  user_email:   string;
  user_name:    string | null;
  location:     string | null;
  month_points: number;
}

interface JobStat { status: string; count: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── Email HTML builder ────────────────────────────────────────────────────────

function section(title: string, content: string): string {
  return `
    <div style="margin-bottom:28px">
      <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #e8620a;padding-bottom:6px">${title}</h2>
      ${content}
    </div>`;
}

function tbl(headers: string[], rows: string[][]): string {
  if (!rows.length) return `<p style="color:#6b7280;font-size:13px;margin:4px 0">No data.</p>`;
  const th = headers.map(h =>
    `<th style="padding:8px 10px;background:#f3f4f6;text-align:left;font-size:12px;color:#374151;border:1px solid #e5e7eb">${h}</th>`
  ).join("");
  const tr = rows.map(r =>
    `<tr>${r.map(c => `<td style="padding:7px 10px;font-size:13px;border:1px solid #e5e7eb;color:#1a1a1a">${c}</td>`).join("")}</tr>`
  ).join("");
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function chip(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;background:${color};color:#fff;border-radius:4px;font-size:11px;font-weight:600">${text}</span>`;
}

function buildEmailHTML(opts: {
  reportDate:     string;
  monthKey:       string;
  sessions:       SessionRow[];
  leaderboard:    LeaderboardRow[];
  newUsers:       { email: string; first_name: string; last_name: string; location: string | null }[];
  newMemberships: { user_email: string; plan: string; amount_paid: number | null }[];
  jobStats:       JobStat[];
  generatedAt:    string;
}): string {
  const { reportDate, monthKey, sessions, leaderboard, newUsers, newMemberships, jobStats, generatedAt } = opts;

  // ── Section 1: Attendance by location ──────────────────────────────────────
  const byLocation = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const loc = s.location || "Unknown";
    if (!byLocation.has(loc)) byLocation.set(loc, []);
    byLocation.get(loc)!.push(s);
  }

  let sec1 = "";
  if (!sessions.length) {
    sec1 = `<p style="color:#6b7280;font-size:13px">No sessions scheduled for ${fmtDate(reportDate)}.</p>`;
  } else {
    for (const [loc, locSessions] of byLocation) {
      const totalAtt = locSessions.reduce((n, s) => n + s.attendees.filter(a => a.attended).length, 0);
      const totalReg = locSessions.reduce((n, s) => n + s.attendees.length, 0);
      sec1 += `<h3 style="margin:16px 0 8px;font-size:14px;color:#374151">${loc} — ${totalAtt} / ${totalReg} attended</h3>`;
      sec1 += tbl(
        ["Session", "Time", "Attended", "Registered", "Absent"],
        locSessions.map(s => {
          const att = s.attendees.filter(a => a.attended).length;
          const reg = s.attendees.length;
          const abs = s.attendees.filter(a => !a.attended).length;
          const attCell = att === 0 ? chip("0", "#ef4444") : att < 5 ? chip(String(att), "#f59e0b") : `<strong>${att}</strong>`;
          return [s.title, s.time ?? "—", attCell, String(reg), String(abs)];
        }),
      );
    }
  }

  // ── Section 2: Top 3 runners per location (this month) ────────────────────
  // leaderboard is pre-sorted by month_points DESC globally, so first 3 per
  // location as we iterate are the top 3.
  const lbByLoc = new Map<string, LeaderboardRow[]>();
  for (const row of leaderboard) {
    const loc = row.location || "Unknown";
    if (!lbByLoc.has(loc)) lbByLoc.set(loc, []);
    if (lbByLoc.get(loc)!.length < 3) lbByLoc.get(loc)!.push(row);
  }

  let sec2 = `<p style="color:#6b7280;font-size:12px;margin:0 0 12px">Month: <strong>${monthKey}</strong></p>`;
  if (!lbByLoc.size) {
    sec2 += `<p style="color:#6b7280;font-size:13px">No leaderboard data for ${monthKey}.</p>`;
  } else {
    for (const [loc, top3] of lbByLoc) {
      sec2 += `<h3 style="margin:16px 0 8px;font-size:14px;color:#374151">${loc}</h3>`;
      sec2 += tbl(
        ["Rank", "Name", "Points This Month"],
        top3.map((r, i) => [
          (["🥇", "🥈", "🥉"][i] ?? String(i + 1)),
          r.user_name || r.user_email,
          `<strong>${r.month_points}</strong>`,
        ]),
      );
    }
  }

  // ── Section 3: Low / missed attendance alert ───────────────────────────────
  const lowSessions = sessions.filter(s => s.attendees.filter(a => a.attended).length < 5);
  const absentees   = sessions.flatMap(s =>
    s.attendees.filter(a => !a.attended).map(a => ({ session: s.title, email: a.email, name: a.name }))
  );

  let sec3 = "";
  if (!lowSessions.length && !absentees.length) {
    sec3 = `<p style="color:#16a34a;font-size:13px">All sessions had 5+ attendees and no missed registrations.</p>`;
  } else {
    if (lowSessions.length) {
      sec3 += `<p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 8px">Sessions with fewer than 5 attendees:</p>`;
      sec3 += tbl(
        ["Session", "Location", "Attendees"],
        lowSessions.map(s => [
          s.title,
          s.location || "—",
          chip(String(s.attendees.filter(a => a.attended).length), "#ef4444"),
        ]),
      );
    }
    if (absentees.length) {
      sec3 += `<p style="color:#92400e;font-size:13px;font-weight:600;margin:12px 0 8px">Registered but absent:</p>`;
      const shown = absentees.slice(0, 25);
      sec3 += tbl(
        ["User", "Session"],
        shown.map(a => [a.name || a.email, a.session]),
      );
      if (absentees.length > 25) {
        sec3 += `<p style="font-size:12px;color:#6b7280;margin:4px 0">…and ${absentees.length - 25} more.</p>`;
      }
    }
  }

  // ── Section 4: New members / memberships ───────────────────────────────────
  let sec4 = "";
  if (!newUsers.length && !newMemberships.length) {
    sec4 = `<p style="color:#6b7280;font-size:13px">No new registrations or memberships in the last 24 hours.</p>`;
  } else {
    if (newUsers.length) {
      sec4 += `<p style="font-weight:600;font-size:13px;margin:0 0 8px">${newUsers.length} new user${newUsers.length > 1 ? "s" : ""} registered:</p>`;
      sec4 += tbl(
        ["Name", "Email", "Location"],
        newUsers.map(u => [
          `${u.first_name} ${u.last_name}`.trim() || "—",
          u.email,
          u.location || "—",
        ]),
      );
    }
    if (newMemberships.length) {
      sec4 += `<p style="font-weight:600;font-size:13px;margin:12px 0 8px">${newMemberships.length} membership${newMemberships.length > 1 ? "s" : ""} activated:</p>`;
      sec4 += tbl(
        ["User", "Plan", "Amount"],
        newMemberships.map(m => [
          m.user_email,
          m.plan,
          m.amount_paid != null ? `₹${Math.round(m.amount_paid / 100)}` : "—",
        ]),
      );
    }
  }

  // ── Section 5: System health ───────────────────────────────────────────────
  const statMap    = Object.fromEntries(jobStats.map(s => [s.status, s.count]));
  const deadCount  = statMap["dead"]   ?? 0;
  const failCount  = statMap["failed"] ?? 0;
  const healthOk   = deadCount === 0 && failCount === 0;

  let sec5 = `<p style="margin:0 0 10px">${
    healthOk ? chip("HEALTHY", "#16a34a") : chip("NEEDS ATTENTION", "#ef4444")
  }</p>`;

  const statusRows = (["pending", "processing", "done", "failed", "dead"] as const)
    .filter(k => (statMap[k] ?? 0) > 0)
    .map(k => {
      const color = k === "dead" || k === "failed" ? "#ef4444"
                  : k === "pending" || k === "processing" ? "#f59e0b"
                  : "#16a34a";
      return [chip(k, color), String(statMap[k] ?? 0)];
    });

  sec5 += statusRows.length
    ? tbl(["Status", "Count"], statusRows)
    : `<p style="color:#6b7280;font-size:13px">Job queue is empty.</p>`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;background:#f5f5f5">
<div style="background:#fff;border-radius:8px;padding:28px;border:1px solid #e5e7eb">
  <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e5e7eb">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1a1a1a">Daily Attendance Report</h1>
    <p style="margin:0;color:#6b7280;font-size:13px">${fmtDate(reportDate)} &bull; Generated at ${generatedAt} IST</p>
  </div>
  ${section("1. Attendance by Location", sec1)}
  ${section("2. Top 3 Runners This Month (per Location)", sec2)}
  ${section("3. Low / Missed Attendance", sec3)}
  ${section("4. New Members & Memberships (Last 24h)", sec4)}
  ${section("5. System Health — Job Queue", sec5)}
  <p style="margin-top:24px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">
    Connected Steps &bull; <a href="${appUrl}/admin" style="color:#e8620a">Open Admin Dashboard</a>
  </p>
</div></body></html>`;
}

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs      = Date.now();
  const db           = getSupabaseServer();
  const nowUTC       = new Date();
  const nowIST       = new Date(nowUTC.getTime() + IST_OFFSET_MS);
  const todayIST     = nowIST.toISOString().slice(0, 10);
  const yesterdayIST = new Date(nowIST.getTime() - 86_400_000).toISOString().slice(0, 10);
  const monthKey     = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, "0")}`;
  const since24h     = new Date(nowUTC.getTime() - 86_400_000).toISOString();

  console.log(`[daily-attendance-report] starting report_date=${yesterdayIST} exec_date=${todayIST}`);

  // ── Phase 1: fetch data (before lock — allows Vercel retry to re-fetch) ────
  const { data: sessionsRaw } = await db
    .from("sessions")
    .select("id, title, location, time")
    .eq("date", yesterdayIST)
    .order("time");

  const sessionIds = (sessionsRaw ?? []).map(s => s.id as string);

  const attRows = sessionIds.length > 0
    ? ((await db
        .from("session_attendance")
        .select("session_id, user_email, user_name, attended")
        .in("session_id", sessionIds)
      ).data ?? [])
    : [];

  const [lbRes, newUsersRes, newMembRes, jobRes] = await Promise.all([
    db.from("leaderboard")
      .select("user_email, user_name, location, month_points")
      .eq("points_month", monthKey)
      .order("month_points", { ascending: false }),

    db.from("users")
      .select("email, first_name, last_name, location, created_at")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false }),

    db.from("memberships")
      .select("user_email, plan, amount_paid, started_at")
      .gte("started_at", since24h)
      .order("started_at", { ascending: false }),

    db.from("job_queue")
      .select("status")
      .in("status", ["pending", "processing", "failed", "dead"]),
  ]);

  // Assemble attendance by session
  const attBySession = new Map<string, { email: string; name: string | null; attended: boolean }[]>();
  for (const a of attRows) {
    const sid = a.session_id as string;
    if (!attBySession.has(sid)) attBySession.set(sid, []);
    attBySession.get(sid)!.push({
      email:    (a.user_email as string).toLowerCase(),
      name:     a.user_name   as string | null,
      attended: a.attended    as boolean,
    });
  }

  const sessions: SessionRow[] = (sessionsRaw ?? []).map(s => ({
    id:        s.id       as string,
    title:     s.title    as string,
    location:  s.location as string ?? "",
    time:      s.time     as string | null,
    attendees: attBySession.get(s.id as string) ?? [],
  }));

  // Job stats: count per status
  const jobCountMap = new Map<string, number>();
  for (const row of jobRes.data ?? []) {
    const st = row.status as string;
    jobCountMap.set(st, (jobCountMap.get(st) ?? 0) + 1);
  }
  const jobStats: JobStat[] = Array.from(jobCountMap.entries()).map(([status, count]) => ({ status, count }));

  const totalAttendees = sessions.reduce((n, s) => n + s.attendees.filter(a => a.attended).length, 0);

  console.log(
    `[daily-attendance-report] data fetched` +
    ` sessions=${sessions.length} attendees=${totalAttendees}` +
    ` lb_rows=${(lbRes.data ?? []).length}` +
    ` new_users=${(newUsersRes.data ?? []).length}` +
    ` new_memberships=${(newMembRes.data ?? []).length}` +
    ` job_rows=${(jobRes.data ?? []).length}`
  );

  // ── Phase 2: acquire lock (after data fetch) ───────────────────────────────
  const acquired = await acquireCronLock("daily-attendance-report", todayIST);
  if (!acquired) {
    console.log(`[daily-attendance-report] already ran for ${todayIST} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: todayIST });
  }

  // ── Phase 3: build email and send (lock held) ──────────────────────────────
  try {
    const generatedAt = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(11, 16);

    const html = buildEmailHTML({
      reportDate:     yesterdayIST,
      monthKey,
      sessions,
      leaderboard:    (lbRes.data      ?? []) as LeaderboardRow[],
      newUsers:       (newUsersRes.data ?? []) as { email: string; first_name: string; last_name: string; location: string | null }[],
      newMemberships: (newMembRes.data  ?? []) as { user_email: string; plan: string; amount_paid: number | null }[],
      jobStats,
      generatedAt,
    });

    const subject = `Daily Report — ${fmtDate(yesterdayIST)} · ${sessions.length} sessions · ${totalAttendees} attendees`;
    const result  = await sendEmail(REPORT_TO, REPORT_TO_NAME, subject, html, false, true);

    if (!result.ok) throw new Error(`Email delivery failed: ${result.error ?? "unknown"}`);

    console.log(
      `[daily-attendance-report] sent ok` +
      ` report_date=${yesterdayIST}` +
      ` sessions=${sessions.length} attendees=${totalAttendees}` +
      ` dead_jobs=${jobCountMap.get("dead") ?? 0}` +
      ` duration=${Date.now() - startMs}ms`
    );

    return NextResponse.json({
      ok:               true,
      report_date:      yesterdayIST,
      sessions:         sessions.length,
      attendees:        totalAttendees,
      new_users:        (newUsersRes.data ?? []).length,
      new_memberships:  (newMembRes.data  ?? []).length,
      dead_jobs:        jobCountMap.get("dead") ?? 0,
      failed_jobs:      jobCountMap.get("failed") ?? 0,
      duration_ms:      Date.now() - startMs,
    });
  } catch (err: unknown) {
    await releaseCronLock("daily-attendance-report", todayIST);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[daily-attendance-report] error (lock released):", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
