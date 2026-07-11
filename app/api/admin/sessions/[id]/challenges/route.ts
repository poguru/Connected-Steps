import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";

// GET — list all challenge awards for a session
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("session_challenges")
    .select("id, user_email, challenge_type, challenge_name, points, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ challenges: data ?? [] });
}

// POST — award a challenge to an attendee
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json() as {
    user_email: string;
    challenge_type: string;
    challenge_name: string;
    points: number;
  };

  const { user_email, challenge_type, challenge_name, points } = body;
  if (!user_email || !challenge_type || !challenge_name || !points || points < 1) {
    return NextResponse.json(
      { error: "user_email, challenge_type, challenge_name, and points (≥1) are required" },
      { status: 400 },
    );
  }

  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("date")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Insert the challenge award record
  const { data: challenge, error: cErr } = await db
    .from("session_challenges")
    .insert({ session_id: id, user_email, challenge_type, challenge_name, points })
    .select("id")
    .single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // Write to points_ledger as the audit/aggregation record that recalculateMonth() reads
  const { error: lErr } = await db.from("points_ledger").insert({
    user_email,
    session_id: id,
    points,
    reason:   challenge_name,
    category: "challenge",
    metadata: { challenge_id: challenge.id, challenge_type },
  });
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  // Auto-recalculate leaderboard so the award is visible immediately
  const month = session.date.slice(0, 7);
  const calc = await recalculateMonth(month, { force: true });

  return NextResponse.json({ challenge, leaderboard: calc });
}

// DELETE — revoke a challenge award
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { challengeId } = await req.json() as { challengeId: string };
  if (!challengeId) return NextResponse.json({ error: "challengeId required" }, { status: 400 });

  const db = getSupabaseServer();

  // Fetch the challenge to verify it belongs to this session and get user_email
  const { data: challenge } = await db
    .from("session_challenges")
    .select("user_email")
    .eq("id", challengeId)
    .eq("session_id", id)
    .single();

  if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

  // Remove the points_ledger entry that was written on award
  await db
    .from("points_ledger")
    .delete()
    .eq("category", "challenge")
    .eq("session_id", id)
    .eq("user_email", challenge.user_email)
    .contains("metadata", { challenge_id: challengeId });

  // Remove the challenge record itself
  await db.from("session_challenges").delete().eq("id", challengeId);

  // Fetch session date for month calculation
  const { data: session } = await db.from("sessions").select("date").eq("id", id).single();
  if (session) {
    await recalculateMonth(session.date.slice(0, 7), { force: true });
  }

  return NextResponse.json({ success: true });
}
