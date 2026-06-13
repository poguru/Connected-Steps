import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 300; // Next.js cache: refresh every 5 min

export async function GET() {
  const db  = getSupabaseServer();
  const now = new Date().toISOString();

  // Month window for "active this month"
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString();

  const [
    usersRes,
    activeMembersRes,
    sessionsRes,
    sessionsAttendedRes,
    runsRes,
    coachRatingsRes,
    communityPostsRes,
    coachCountRes,
    activeThisMonthRes,
  ] = await Promise.all([
    // Total registered members
    db.from("users").select("*", { count: "exact", head: true }),

    // Currently active paid members
    db.from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", now),

    // Total sessions/trainings conducted
    db.from("sessions").select("*", { count: "exact", head: true }),

    // Total session check-ins across all time
    db.from("session_attendance")
      .select("*", { count: "exact", head: true })
      .eq("attended", true),

    // Weekend run registrations
    db.from("run_registrations").select("*", { count: "exact", head: true }),

    // All coach ratings (to compute real avg)
    db.from("coach_ratings").select("rating"),

    // Approved community posts
    db.from("community_posts")
      .select("*", { count: "exact", head: true })
      .eq("approved", true),

    // Active coaches
    db.from("coach_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),

    // Runners active this month (any leaderboard entry with month_points > 0)
    db.from("leaderboard")
      .select("*", { count: "exact", head: true })
      .gt("month_points", 0),
  ]);

  // Compute real average rating — null if no ratings exist yet
  const coachRatings = (coachRatingsRes.data ?? []).map((r) => r.rating as number);
  const avgRating    = coachRatings.length
    ? Math.round((coachRatings.reduce((a, b) => a + b, 0) / coachRatings.length) * 10) / 10
    : null;

  return NextResponse.json({
    totalRunners:       usersRes.count              ?? 0,
    activeMembers:      activeMembersRes.count       ?? 0,
    trainingsConducted: sessionsRes.count            ?? 0,
    sessionsAttended:   sessionsAttendedRes.count    ?? 0,
    weekendRuns:        runsRes.count                ?? 0,
    communityPosts:     communityPostsRes.count      ?? 0,
    coachCount:         coachCountRes.count          ?? 0,
    activeThisMonth:    activeThisMonthRes.count     ?? 0,
    avgRating,           // null when no real ratings exist
  });
}
