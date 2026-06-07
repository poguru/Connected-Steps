import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export interface FeedEvent {
  id:          string;
  actor_email: string;
  actor_name:  string;
  event_type:  "session_attended" | "photo_uploaded" | "badge_earned";
  payload:     Record<string, string | number>;
  created_at:  string;
}

// GET /api/feed?email=  → activity from followed users (last 20 events)
export async function GET(req: NextRequest) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ events: [] });

    const db = getSupabaseServer();

    // Get the list of people this user follows
    const { data: followRows } = await db
      .from("follows")
      .select("following_email")
      .eq("follower_email", email);

    const following = (followRows ?? []).map(r => r.following_email);
    if (following.length === 0) return NextResponse.json({ events: [] });

    // Fetch recent attended sessions from followed users
    const { data: sessions } = await db
      .from("session_attendance")
      .select("user_email, user_name, attended, sessions(id, title, date, venue)")
      .in("user_email", following)
      .eq("attended", true)
      .order("sessions(date)", { ascending: false })
      .limit(10);

    // Fetch recent photo uploads from followed users
    const { data: photos } = await db
      .from("session_photos")
      .select("id, uploader_email, uploader_name, session_id, photo_url, caption, created_at")
      .in("uploader_email", following)
      .order("created_at", { ascending: false })
      .limit(10);

    // Build events list
    const events: FeedEvent[] = [];

    for (const s of sessions ?? []) {
      const sessRaw = s.sessions as unknown;
      const sess    = (Array.isArray(sessRaw) ? sessRaw[0] : sessRaw) as { id: string; title: string; date: string; venue: string | null } | null;
      if (!sess) continue;
      events.push({
        id:          `session_${s.user_email}_${sess.id}`,
        actor_email: s.user_email,
        actor_name:  s.user_name ?? s.user_email.split("@")[0],
        event_type:  "session_attended",
        payload:     { session_title: sess.title, session_date: sess.date, venue: sess.venue ?? "" },
        created_at:  sess.date + "T06:00:00Z",
      });
    }

    for (const p of photos ?? []) {
      events.push({
        id:          `photo_${p.id}`,
        actor_email: p.uploader_email,
        actor_name:  p.uploader_name ?? p.uploader_email.split("@")[0],
        event_type:  "photo_uploaded",
        payload:     { session_id: p.session_id, photo_id: p.id, photo_url: p.photo_url, caption: p.caption ?? "" },
        created_at:  p.created_at,
      });
    }

    // Sort by created_at desc, take 20
    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ events: events.slice(0, 20) });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
