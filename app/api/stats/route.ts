import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const db  = getSupabaseServer();
  const now = new Date().toISOString();

  const [usersRes, membershipsRes, sessionsAttendedRes, sessionsRes, runsRes, coachRatingsRes] = await Promise.all([
    db.from("users").select("*", { count: "exact", head: true }),
    db.from("memberships").select("*", { count: "exact", head: true }).eq("status", "active").gt("expires_at", now),
    db.from("session_attendance").select("*", { count: "exact", head: true }).eq("attended", true),
    db.from("sessions").select("*", { count: "exact", head: true }),
    db.from("run_registrations").select("*", { count: "exact", head: true }),
    db.from("coach_ratings").select("rating"),
  ]);

  const coachRatings = (coachRatingsRes.data ?? []).map((r) => r.rating as number);
  const avgRating    = coachRatings.length
    ? Math.round((coachRatings.reduce((a, b) => a + b, 0) / coachRatings.length) * 10) / 10
    : null;

  return NextResponse.json({
    totalRunners:       usersRes.count          ?? 0,
    activeMembers:      membershipsRes.count     ?? 0,
    sessionsAttended:   sessionsAttendedRes.count ?? 0,
    avgRating,
    trainingsConducted: sessionsRes.count        ?? 0,
    weekendRuns:        runsRes.count            ?? 0,
  });
}
