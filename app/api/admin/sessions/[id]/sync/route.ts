import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

const ATTENDANCE_POINTS = 5;

async function addPoints(db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>, email: string, pts: number) {
  const { data: existing } = await db
    .from("leaderboard")
    .select("week_points, total_points")
    .eq("user_email", email)
    .single();

  if (existing) {
    await db
      .from("leaderboard")
      .update({
        week_points:  (existing.week_points  ?? 0) + pts,
        total_points: (existing.total_points ?? 0) + pts,
        updated_at:   new Date().toISOString(),
      })
      .eq("user_email", email);
  } else {
    // User has no leaderboard entry yet — create one
    const { data: user } = await db
      .from("users")
      .select("first_name, last_name, location, goal")
      .eq("email", email)
      .single();

    await db.from("leaderboard").insert({
      user_email:      email,
      user_name:       user ? `${user.first_name} ${user.last_name}` : email,
      location:        user?.location ?? "",
      goal:            user?.goal     ?? "",
      week_points:     pts,
      total_points:    pts,
      week_runs:       0,
      week_km:         0,
      week_time_secs:  0,
      total_runs:      0,
      total_km:        0,
      total_time_secs: 0,
    });
  }
}

// POST — sync unsynced attendance + bonus points to leaderboard
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: records, error } = await db
    .from("session_attendance")
    .select("*")
    .eq("session_id", id)
    .eq("points_synced", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!records || records.length === 0) {
    return NextResponse.json({ synced: 0, message: "Nothing to sync." });
  }

  let synced = 0;
  for (const rec of records) {
    const pts = (rec.attended ? ATTENDANCE_POINTS : 0) + (rec.bonus_points ?? 0);
    if (pts > 0) {
      await addPoints(db, rec.user_email, pts);
      synced++;
    }
    // Mark as synced regardless (even 0 pts, so we don't re-process)
    await db
      .from("session_attendance")
      .update({ points_synced: true })
      .eq("id", rec.id);
  }

  return NextResponse.json({ synced, message: `Synced points for ${synced} participant(s).` });
}
