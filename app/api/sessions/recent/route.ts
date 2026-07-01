import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 120;

export async function GET() {
  const db = getSupabaseServer();

  // Last 10 sessions that have a photo
  const { data: sessions } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location, photo_url")
    .not("photo_url", "is", null)
    .order("date", { ascending: false })
    .limit(10);

  if (!sessions || sessions.length === 0) return NextResponse.json({ sessions: [] });

  const sessionIds = sessions.map(s => s.id);

  // ── Fetch cover media from the session_media table ──────────────────────────
  // Gracefully degrades if the table does not yet exist (migration pending).
  type CoverRow = { session_id: string; media_type: string; url: string; thumbnail_url: string | null; duration_secs: number | null };
  const coverMap: Record<string, CoverRow> = {};
  try {
    const { data: covers } = await db
      .from("session_media")
      .select("session_id, media_type, url, thumbnail_url, duration_secs")
      .in("session_id", sessionIds)
      .eq("is_cover", true);
    for (const row of covers ?? []) coverMap[row.session_id] = row;
  } catch { /* session_media may not exist yet */ }

  // ── Fetch feedback for each session ─────────────────────────────────────────
  const results = await Promise.all(
    sessions.map(async (s) => {
      const { data: feedback } = await db
        .from("session_feedback")
        .select("user_name, rating, comment")
        .eq("session_id", s.id)
        .order("created_at", { ascending: false });

      const fb        = feedback ?? [];
      const avgRating = fb.length > 0
        ? Math.round((fb.reduce((sum, f) => sum + f.rating, 0) / fb.length) * 10) / 10
        : null;

      // Media count for gallery badge
      let mediaCount = 0;
      try {
        const { count } = await db
          .from("session_media")
          .select("id", { count: "exact", head: true })
          .eq("session_id", s.id);
        mediaCount = count ?? 0;
      } catch { /* session_media may not exist yet */ }

      const cover = coverMap[s.id] ?? null;

      return {
        ...s,
        avgRating,
        reviewCount:         fb.length,
        feedback:            fb,
        // Cover media — null when no session_media row exists (uses photo_url fallback)
        cover_media_type:    cover?.media_type     ?? null,
        cover_media_url:     cover?.url            ?? null,
        cover_thumbnail_url: cover?.thumbnail_url  ?? null,
        cover_duration_secs: cover?.duration_secs  ?? null,
        media_count:         mediaCount,
      };
    })
  );

  return NextResponse.json({ sessions: results });
}
