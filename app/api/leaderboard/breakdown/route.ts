import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export interface ScoreBreakdown {
  user_email:     string;
  user_name:      string;
  sessions: {
    session_id:   string;
    title:        string;
    date:         string;
    base_pts:     number;
    bonus_pts:    number;
    total_pts:    number;
  }[];
  session_points: number;
  weekly_bonus:   number;
  total_month:    number;
  total_alltime:  number;
  total_xp:       number;
}

// GET /api/leaderboard/breakdown?email=&month=YYYY-MM
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email  = searchParams.get("email");
  const month  = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();

  const [year, mo]  = month.split("-").map(Number);
  const rangeStart  = `${month}-01`;
  const rangeEnd    = `${month}-${String(new Date(year, mo, 0).getDate()).padStart(2, "0")}`;

  // Get attended sessions for this user this month
  const { data: attendance } = await db
    .from("session_attendance")
    .select("session_id, attended, bonus_points, sessions!inner(id, title, date)")
    .eq("user_email", email.toLowerCase())
    .eq("attended", true)
    .gte("sessions.date", rangeStart)
    .lte("sessions.date", rangeEnd);

  const { data: user } = await db
    .from("users")
    .select("first_name, last_name")
    .eq("email", email.toLowerCase())
    .single();

  const { data: lb } = await db
    .from("leaderboard")
    .select("month_points, total_points")
    .eq("user_email", email.toLowerCase())
    .single();

  // Build per-session breakdown
  function mondayKey(dateStr: string): string {
    const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().slice(0, 10);
  }

  const weekCounts: Record<string, number> = {};
  const sessions = [];
  let session_points = 0;

  for (const row of attendance ?? []) {
    const sessRaw = row.sessions as unknown;
    const sess = (Array.isArray(sessRaw) ? sessRaw[0] : sessRaw) as { id: string; title: string; date: string } | null;
    if (!sess) continue;

    const base_pts  = 5;
    const bonus_pts = row.bonus_points ?? 0;
    const total_pts = base_pts + bonus_pts;
    session_points += total_pts;

    const wk = mondayKey(sess.date);
    weekCounts[wk] = (weekCounts[wk] ?? 0) + 1;

    sessions.push({ session_id: sess.id, title: sess.title, date: sess.date, base_pts, bonus_pts, total_pts });
  }

  const weekly_bonus = Object.values(weekCounts).filter(c => c >= 4).length * 5;
  const total_month  = session_points + weekly_bonus;
  const total_alltime = lb?.total_points ?? total_month;
  const total_xp      = total_alltime * 5;

  const user_name = user ? `${user.first_name} ${user.last_name}`.trim() : email.split("@")[0];

  const breakdown: ScoreBreakdown = {
    user_email: email,
    user_name,
    sessions:   sessions.sort((a, b) => a.date.localeCompare(b.date)),
    session_points,
    weekly_bonus,
    total_month,
    total_alltime,
    total_xp,
  };

  return NextResponse.json({ breakdown });
}
