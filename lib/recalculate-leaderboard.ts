import { getSupabaseServer } from "@/lib/supabase-server";

function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function mondayKey(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  const dow = d.getUTCDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysBack);
  return monday.toISOString().slice(0, 10);
}

export async function recalculateMonth(month: string): Promise<{ message: string; updated: number }> {
  const [year, mo] = month.split("-").map(Number);
  const rangeStart = `${month}-01`;
  const rangeEnd   = `${month}-${String(lastDay(year, mo)).padStart(2, "0")}T23:59:59Z`;

  const db = getSupabaseServer();

  const { data: sessions, error: sErr } = await db
    .from("sessions")
    .select("id, date, location")
    .gte("date", rangeStart)
    .lte("date", rangeEnd)
    .order("date");

  if (sErr) throw new Error(sErr.message);
  if (!sessions?.length) return { message: "No sessions in this month.", updated: 0 };

  const sessionIds = sessions.map((s) => s.id);

  const { data: allAtt, error: aErr } = await db
    .from("session_attendance")
    .select("id, session_id, user_email, attended, bonus_points")
    .in("session_id", sessionIds);

  if (aErr) throw new Error(aErr.message);
  if (!allAtt?.length) return { message: "No attendance records found.", updated: 0 };

  const emails = [...new Set(allAtt.map((a) => a.user_email))];

  const { data: users, error: uErr } = await db
    .from("users")
    .select("email, first_name, last_name, location, goal")
    .in("email", emails);
  if (uErr) throw new Error(uErr.message);

  const userMap = new Map((users ?? []).map((u) => [u.email, u]));

  const { data: existing } = await db
    .from("leaderboard")
    .select("user_email, month_points, total_points, points_month")
    .in("user_email", emails);
  const lbMap = new Map((existing ?? []).map((e) => [e.user_email, e]));

  const userAttMap  = new Map<string, { session_id: number; attended: boolean; bonus_points: number }[]>();
  const attIdsByUser = new Map<string, number[]>();

  for (const att of allAtt) {
    if (!userAttMap.has(att.user_email)) {
      userAttMap.set(att.user_email, []);
      attIdsByUser.set(att.user_email, []);
    }
    userAttMap.get(att.user_email)!.push({
      session_id:   att.session_id,
      attended:     att.attended,
      bonus_points: att.bonus_points ?? 0,
    });
    attIdsByUser.get(att.user_email)!.push(att.id);
  }

  let updated = 0;

  for (const email of emails) {
    const user = userMap.get(email);
    if (!user) continue;

    const userAtt = userAttMap.get(email) ?? [];
    const attById = new Map(userAtt.map((a) => [a.session_id, a]));
    const userLoc = (user.location ?? "").trim().toLowerCase();

    const locSessions = sessions.filter(
      (s) => (s.location ?? "").trim().toLowerCase() === userLoc
    );
    if (!locSessions.length) continue;

    let basePoints = 0;
    for (const sess of locSessions) {
      const att = attById.get(sess.id);
      if (att?.attended) basePoints += 5 + (att.bonus_points ?? 0);
    }

    const weekMap = new Map<string, typeof locSessions>();
    for (const sess of locSessions) {
      const wk = mondayKey(sess.date);
      if (!weekMap.has(wk)) weekMap.set(wk, []);
      weekMap.get(wk)!.push(sess);
    }
    const weeks = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b));

    let weeklyBonus = 0;
    let streak      = 0;

    for (const [, weekSessions] of weeks) {
      const allAttended = weekSessions.every((s) => attById.get(s.id)?.attended === true);
      if (allAttended) {
        weeklyBonus += 5;
        streak++;
        if (streak === 1)    weeklyBonus += 5;
        else if (streak >= 2) weeklyBonus += 10;
      } else {
        streak = 0;
      }
    }

    const newMonthPts = basePoints + weeklyBonus;
    const lb          = lbMap.get(email);
    const oldMonthPts = lb && lb.points_month === month ? (lb.month_points ?? 0) : 0;
    const oldTotal    = lb?.total_points ?? 0;
    const newTotal    = Math.max(0, oldTotal - oldMonthPts + newMonthPts);

    if (lb) {
      await db.from("leaderboard").update({
        month_points: newMonthPts,
        total_points: newTotal,
        points_month: month,
        updated_at:   new Date().toISOString(),
      }).eq("user_email", email);
    } else {
      await db.from("leaderboard").insert({
        user_email:      email,
        user_name:       `${user.first_name} ${user.last_name}`,
        location:        user.location ?? "",
        goal:            user.goal ?? "",
        month_points:    newMonthPts,
        total_points:    newMonthPts,
        points_month:    month,
        month_runs:      0,
        month_km:        0,
        month_time_secs: 0,
        total_runs:      0,
        total_km:        0,
        total_time_secs: 0,
        updated_at:      new Date().toISOString(),
      });
    }

    const ids = attIdsByUser.get(email) ?? [];
    if (ids.length) {
      await db.from("session_attendance").update({ points_synced: true }).in("id", ids);
    }

    updated++;
  }

  return { message: `Recalculated points for ${updated} user(s) — ${month}.`, updated };
}
