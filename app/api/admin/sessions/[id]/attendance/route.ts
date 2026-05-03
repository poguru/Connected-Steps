import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

// GET — session info + users at that location + their attendance records
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });

  // All registered users at this location (case-insensitive)
  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name, location")
    .ilike("location", `%${session.location}%`);

  // Existing attendance records for this session
  const { data: attendance } = await db
    .from("session_attendance")
    .select("*")
    .eq("session_id", id);

  const attendanceMap: Record<string, { attended: boolean; bonus_points: number; bonus_reason: string; points_synced: boolean }> = {};
  (attendance ?? []).forEach((a) => {
    attendanceMap[a.user_email] = {
      attended:      a.attended,
      bonus_points:  a.bonus_points,
      bonus_reason:  a.bonus_reason,
      points_synced: a.points_synced,
    };
  });

  const merged = (users ?? []).map((u) => ({
    email:         u.email,
    name:          `${u.first_name} ${u.last_name}`,
    location:      u.location,
    attended:      attendanceMap[u.email]?.attended      ?? false,
    bonus_points:  attendanceMap[u.email]?.bonus_points  ?? 0,
    bonus_reason:  attendanceMap[u.email]?.bonus_reason  ?? "",
    points_synced: attendanceMap[u.email]?.points_synced ?? false,
  }));

  return NextResponse.json({ session, users: merged });
}

// POST — save attendance + bonus points (does NOT sync to leaderboard yet)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { users } = await req.json() as {
    users: { email: string; name: string; attended: boolean; bonus_points: number; bonus_reason: string }[];
  };

  const db = getSupabaseServer();

  const records = users.map((u) => ({
    session_id:    id,
    user_email:    u.email,
    user_name:     u.name,
    attended:      u.attended,
    bonus_points:  u.bonus_points  ?? 0,
    bonus_reason:  u.bonus_reason  ?? "",
    points_synced: false,
  }));

  const { error } = await db
    .from("session_attendance")
    .upsert(records, { onConflict: "session_id,user_email", ignoreDuplicates: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
