import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const [usersRes, membershipsRes, plansRes, sessionsRes, attendanceRes, cohortMembersRes, cohortsRes] =
    await Promise.all([
      db.from("users").select("email, first_name, last_name, phone, goal, location, created_at").order("created_at", { ascending: false }),
      db.from("memberships").select("user_email, plan, status, expires_at"),
      db.from("training_plans").select("user_email, title, created_at").eq("active", true),
      db.from("sessions").select("id, title, date").order("date", { ascending: false }),
      db.from("session_attendance").select("user_email, session_id, attended"),
      db.from("cohort_members").select("cohort_id, user_email"),
      db.from("cohorts").select("id, name, color"),
    ]);

  const now            = new Date();
  const twoWeeksAgo   = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const membershipMap  = Object.fromEntries((membershipsRes.data ?? []).map(m => [m.user_email, m]));
  const planMap        = Object.fromEntries((plansRes.data ?? []).map(p => [p.user_email, p]));
  const cohortMap      = Object.fromEntries((cohortsRes.data ?? []).map(c => [c.id, c]));
  const sessions       = (sessionsRes.data ?? []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // user_email → { session_id → attended }
  const attendanceByUser: Record<string, Record<string, boolean>> = {};
  for (const a of attendanceRes.data ?? []) {
    if (!attendanceByUser[a.user_email]) attendanceByUser[a.user_email] = {};
    attendanceByUser[a.user_email][a.session_id] = a.attended;
  }

  // user_email → cohort names[]
  const userCohortNames: Record<string, string[]> = {};
  for (const m of (cohortMembersRes.data ?? [])) {
    if (!userCohortNames[m.user_email]) userCohortNames[m.user_email] = [];
    const name = cohortMap[m.cohort_id]?.name;
    if (name) userCohortNames[m.user_email].push(name);
  }

  const athletes = (usersRes.data ?? []).map(u => {
    const membership     = membershipMap[u.email];
    const isActiveMember = !!(membership?.status === "active" && new Date(membership.expires_at) > now);
    const userAttend     = attendanceByUser[u.email] ?? {};

    // Sessions attended (attended=true)
    const attendedIds      = new Set(Object.entries(userAttend).filter(([, v]) => v).map(([id]) => id));
    const attendedSessions = sessions.filter(s => attendedIds.has(s.id));
    const lastSession      = attendedSessions[0] ?? null;
    const attendancePct    = sessions.length > 0 ? Math.round((attendedIds.size / sessions.length) * 100) : 0;

    // Streak: consecutive attended from most recent session that has any record
    let streak = 0;
    for (const s of sessions) {
      if (userAttend[s.id] === true)       { streak++; }
      else if (userAttend[s.id] === false) { break; }
      // no record → skip (don't break streak)
    }

    const lastDate   = lastSession ? new Date(lastSession.date) : null;
    const isAtRisk   = isActiveMember && (!lastDate || lastDate < twoWeeksAgo);
    const isLowAtt   = attendedIds.size >= 2 && attendancePct < 40;

    return {
      email:              u.email,
      first_name:         u.first_name,
      last_name:          u.last_name,
      phone:              u.phone              ?? "",
      goal:               u.goal               ?? "",
      location:           u.location           ?? "",
      joined:             u.created_at,
      is_active_member:   isActiveMember,
      membership_plan:    isActiveMember ? (membership?.plan ?? null) : null,
      membership_expires: isActiveMember ? (membership?.expires_at ?? null) : null,
      training_plan:      planMap[u.email]?.title ?? null,
      last_session_date:  lastSession?.date  ?? null,
      last_session_title: lastSession?.title ?? null,
      attended_count:     attendedIds.size,
      attendance_pct:     attendancePct,
      streak,
      is_at_risk:         isAtRisk,
      is_low_att:         isLowAtt,
      has_plan:           !!planMap[u.email],
      cohorts:            userCohortNames[u.email] ?? [],
    };
  });

  return NextResponse.json({
    athletes,
    stats: {
      total:          athletes.length,
      active_members: athletes.filter(a => a.is_active_member).length,
      at_risk:        athletes.filter(a => a.is_at_risk).length,
      low_att:        athletes.filter(a => a.is_low_att).length,
      no_plan:        athletes.filter(a => !a.has_plan && a.is_active_member).length,
    },
  });
}
