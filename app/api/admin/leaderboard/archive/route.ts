import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET — live leaderboard + all archived months
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();

  const [liveRes, archiveRes] = await Promise.all([
    db.from("leaderboard")
      .select("user_email, user_name, location, goal, month_points, total_points")
      .order("month_points", { ascending: false }),
    db.from("monthly_leaderboard_archive")
      .select("*")
      .order("month", { ascending: false })
      .order("rank",  { ascending: true }),
  ]);

  if (liveRes.error)    return NextResponse.json({ error: liveRes.error.message },    { status: 500 });
  if (archiveRes.error) return NextResponse.json({ error: archiveRes.error.message }, { status: 500 });

  return NextResponse.json({ live: liveRes.data ?? [], archives: archiveRes.data ?? [] });
}

// POST — snapshot current month's leaderboard into the archive
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const month: string = body.month ?? new Date().toISOString().slice(0, 7); // "2026-05"

  const db = getSupabaseServer();

  // Fetch current leaderboard ordered by month_points
  const { data: entries, error: fetchErr } = await db
    .from("leaderboard")
    .select("user_email, user_name, location, goal, month_points, total_points")
    .order("month_points", { ascending: false });

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "No leaderboard entries to archive." }, { status: 400 });
  }

  // Delete any existing archive for this month (allow re-archiving)
  await db.from("monthly_leaderboard_archive").delete().eq("month", month);

  const rows = entries
    .filter((e) => (e.month_points ?? 0) > 0)
    .map((e, i) => ({
      month,
      rank:         i + 1,
      user_email:   e.user_email,
      user_name:    e.user_name,
      location:     e.location ?? "",
      goal:         e.goal ?? "",
      month_points: e.month_points ?? 0,
      total_points: e.total_points ?? 0,
      archived_at:  new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No participants with points this month." }, { status: 400 });
  }

  const { error: insertErr } = await db.from("monthly_leaderboard_archive").insert(rows);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ saved: rows.length, month });
}
