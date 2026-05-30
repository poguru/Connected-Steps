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

  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name, location")
    .ilike("location", `%${session.location}%`);

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

// POST — save attendance + bonus points, preserving already-synced rows
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
