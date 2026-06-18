import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db    = getSupabaseServer();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from("session_attendance")
    .select(`
      attended,
      bonus_points,
      bonus_reason,
      points_synced,
      sessions!inner (
        id,
        title,
        date,
        time,
        venue,
        location,
        photo_url
      )
    `)
    .eq("user_email", userEmail.toLowerCase())
    .lte("sessions.date", today)
    .order("sessions(date)", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}
