import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 120;

export async function GET() {
  const db = getSupabaseServer();

  // Last 7 sessions that have a photo
  const { data: sessions } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location, photo_url")
    .not("photo_url", "is", null)
    .order("date", { ascending: false })
    .limit(7);

  if (!sessions || sessions.length === 0) return NextResponse.json({ sessions: [] });

  // Fetch feedback for each session
  const results = await Promise.all(
    sessions.map(async (s) => {
      const { data: feedback } = await db
        .from("session_feedback")
        .select("user_name, rating, comment")
        .eq("session_id", s.id)
        .order("created_at", { ascending: false });

      const fb = feedback ?? [];
      const avgRating = fb.length > 0
        ? Math.round((fb.reduce((sum, f) => sum + f.rating, 0) / fb.length) * 10) / 10
        : null;

      return { ...s, avgRating, reviewCount: fb.length, feedback: fb };
    })
  );

  return NextResponse.json({ sessions: results });
}
