import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("session_attendance")
    .select(`
      attended,
      bonus_points,
      bonus_reason,
      points_synced,
      sessions (
        id,
        title,
        date,
        time,
        venue,
        location,
        photo_url
      )
    `)
    .eq("user_email", email.toLowerCase())
    .order("sessions(date)", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sessions: data ?? [] });
}
