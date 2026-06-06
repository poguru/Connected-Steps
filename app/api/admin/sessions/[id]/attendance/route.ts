import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET — session info + users who joined via link + their attendance status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });

  // Only show users who registered via the join link
  const { data: attendance } = await db
    .from("session_attendance")
    .select("user_email, user_name, attended, bonus_points, bonus_reason, points_synced")
    .eq("session_id", id);

  if (!attendance?.length) return NextResponse.json({ session, users: [] });

  const emails = attendance.map((a) => a.user_email);
  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name, location")
    .in("email", emails);

  const userMap = Object.fromEntries((users ?? []).map((u) => [u.email, u]));

  const merged = attendance.map((a) => {
    const u = userMap[a.user_email];
    return {
      email:         a.user_email,
      name:          u ? `${u.first_name} ${u.last_name}` : a.user_name,
      location:      u?.location ?? "",
      attended:      a.attended,
      bonus_points:  a.bonus_points  ?? 0,
      bonus_reason:  a.bonus_reason  ?? "",
      points_synced: a.points_synced ?? false,
    };
  });

  return NextResponse.json({ session, users: merged });
}

// POST — save attendance + bonus points, preserving already-synced rows
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { users } = await req.json() as {
    users: { email: string; name: string; attended: boolean; bonus_points: number; bonus_reason: string }[];
  };

  const db = getSupabaseServer();

  // Fetch existing records to preserve points_synced status
  const { data: existing } = await db
    .from("session_attendance")
    .select("user_email, points_synced")
    .eq("session_id", id);

  const syncedEmails = new Set(
    (existing ?? []).filter((r) => r.points_synced).map((r) => r.user_email)
  );

  // Only upsert rows that are not already synced
  const toUpsert = users
    .filter((u) => !syncedEmails.has(u.email))
    .map((u) => ({
      session_id:    id,
      user_email:    u.email,
      user_name:     u.name,
      attended:      u.attended,
      bonus_points:  u.bonus_points  ?? 0,
      bonus_reason:  u.bonus_reason  ?? "",
      points_synced: false,
    }));

  if (toUpsert.length) {
    const { error } = await db
      .from("session_attendance")
      .upsert(toUpsert, { onConflict: "session_id,user_email", ignoreDuplicates: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    saved:   toUpsert.length,
    skipped: syncedEmails.size,
  });
}

// PUT — manually add a user to a session's attendance list
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { email } = await req.json() as { email: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data: user } = await db
    .from("users")
    .select("email, first_name, last_name")
    .eq("email", email.toLowerCase())
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { error } = await db.from("session_attendance").upsert({
    session_id:    id,
    user_email:    user.email,
    user_name:     `${user.first_name} ${user.last_name}`.trim(),
    attended:      false,
    bonus_points:  0,
    bonus_reason:  "",
    points_synced: false,
  }, { onConflict: "session_id,user_email", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, name: `${user.first_name} ${user.last_name}`.trim() });
}
