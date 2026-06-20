import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getCoachEmailFromCookie } from "@/lib/admin-auth";
import { calcHardBreakStreak } from "@/lib/streak-utils";

// GET /api/coach/athletes — returns only athletes assigned to the logged-in coach
export async function GET(req: NextRequest) {
  const coachEmail = getCoachEmailFromCookie(req);
  if (!coachEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // Get coach ID
  const { data: coach } = await db
    .from("coaches")
    .select("id")
    .eq("email", coachEmail)
    .eq("is_active", true)
    .single();

  if (!coach) return NextResponse.json({ error: "Coach not found" }, { status: 404 });

  // Get assigned athlete emails
  const { data: assignments } = await db
    .from("coach_assignments")
    .select("user_email")
    .eq("coach_id", coach.id)
    .eq("is_active", true);

  const assignedEmails = (assignments ?? []).map(a => a.user_email.toLowerCase());
  if (assignedEmails.length === 0) {
    return NextResponse.json({ athletes: [], stats: { total: 0, active_members: 0, at_risk: 0, low_att: 0, no_plan: 0 } });
  }

  const [usersRes, membershipsRes, plansRes, sessionsRes, attendanceRes] = await Promise.all([
    db.from("users").select("email, first_name, last_name, phone, goal, location, created_at").in("email", assignedEmails),
    db.from("memberships").select("user_email, plan, status, expires_at").in("user_email", assignedEmails),
    db.from("training_plans").select("user_email, title, created_at").eq("active", true).in("user_email", assignedEmails),
    db.from("sessions").select("id, title, date").order("date", { ascending: false }),
    db.from("session_attendance").select("user_email, session_id, attended").in("user_email", assignedEmails),
  ]);

  const now           = new Date();
  const twoWeeksAgo  = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const membershipMap = Object.fromEntries((membershipsRes.data ?? []).map(m => [m.user_email, m]));
  const planMap       = Object.fromEntries((plansRes.data ?? []).map(p => [p.user_email, p]));
  const sessions      = (sessionsRes.data ?? []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const attendanceByUser: Record<string, Record<string, boolean>> = {};
  for (const a of attendanceRes.data ?? []) {
    if (!attendanceByUser[a.user_email]) attendanceByUser[a.user_email] = {};
    attendanceByUser[a.user_email][a.session_id] = a.attended;
  }

  const athletes = (usersRes.data ?? []).map(u => {
    const membership     = membershipMap[u.email];
    const isActiveMember = !!(membership?.status === "active" && new Date(membership.expires_at) > now);
    const userAttend     = attendanceByUser[u.email] ?? {};
    const attendedIds    = new Set(Object.entries(userAttend).filter(([, v]) => v).map(([id]) => id));
    const attendedSess   = sessions.filter(s => attendedIds.has(s.id));
    const lastSession    = attendedSess[0] ?? null;
    const attendancePct  = sessions.length > 0 ? Math.round((attendedIds.size / sessions.length) * 100) : 0;
    const streak         = calcHardBreakStreak(sessions.map(s => ({ attended: userAttend[s.id] })));
    const lastDate       = lastSession ? new Date(lastSession.date) : null;

    return {
      email:              u.email,
      first_name:         u.first_name,
      last_name:          u.last_name,
      phone:              u.phone      ?? "",
      goal:               u.goal       ?? "",
      location:           u.location   ?? "",
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
      is_at_risk:         isActiveMember && (!lastDate || lastDate < twoWeeksAgo),
      is_low_att:         attendedIds.size >= 2 && attendancePct < 40,
      has_plan:           !!planMap[u.email],
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
