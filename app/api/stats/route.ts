import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const db  = getSupabaseServer();
  const now = new Date().toISOString();

  const [usersRes, membershipsRes, sessionsAttendedRes, storiesRes, sessionsRes, runsRes] = await Promise.all([
    db.from("users").select("*", { count: "exact", head: true }),
    db.from("memberships").select("*", { count: "exact", head: true }).eq("status", "active").gt("expires_at", now),
    db.from("session_attendance").select("*", { count: "exact", head: true }).eq("attended", true),
    db.from("stories").select("rating").eq("approved", true).not("rating", "is", null),
    db.from("sessions").select("*", { count: "exact", head: true }),
    db.from("run_registrations").select("*", { count: "exact", head: true }),
  ]);

  const ratings   = (storiesRes.data ?? []).map((s) => s.rating as number);
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
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
