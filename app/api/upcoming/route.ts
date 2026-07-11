import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const PHOTO_KEYWORDS = ["recovery", "mobility", "strength", "conditioning", "interval", "speed", "agility", "endurance", "long run", "hill", "trail"];
function extractKeyword(title: string): string | null {
  const t = title.toLowerCase();
  for (const kw of PHOTO_KEYWORDS) if (t.includes(kw)) return kw;
  return null;
}

export async function GET(req: NextRequest) {
  const db = getSupabaseServer();

  const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = istNow.toISOString().split("T")[0];
  const nowMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const nowTime = `${String(istNow.getUTCHours()).padStart(2, "0")}:${String(istNow.getUTCMinutes()).padStart(2, "0")}`;

  const userToken = req.headers.get("x-user-token");
  const userEmail = userToken ? verifyUserToken(userToken) : null;

  // ── Round 1: sessions + events ────────────────────────────────────────────────
  const [sessRes, evtRes] = await Promise.all([
    db.from("sessions")
      .select("id, title, date, time, venue, location, photo_url")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(8),

    db.from("events")
      .select("id, title, event_type, cover_image, start_date, start_time, location, price, max_participants, participant_count, featured, share_slug, registration_required")
      .eq("status", "published")
      .or(
        `end_date.gt.${today},` +
        `and(end_date.eq.${today},end_time.gt.${nowTime}),` +
        `and(end_date.eq.${today},end_time.is.null),` +
        `and(end_date.is.null,start_date.gte.${today})`
      )
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true })
      .limit(6),
  ]);

  // Filter today's sessions that started >2 hours ago
  const sessions = (sessRes.data ?? []).filter((s) => {
    if (s.date !== today || !s.time) return true;
    const [h, m] = (s.time as string).split(":").map(Number);
    return nowMins < h * 60 + m + 120;
  });

  const events     = evtRes.data ?? [];
  const sessionIds = sessions.map((s) => s.id as string);
  const eventIds   = events.map((e) => e.id as string);

  // Titles for photo / count lookups
  const titlesWithoutPhoto = [...new Set(sessions.filter(s => !s.photo_url).map(s => s.title as string))];
  const sessionTitles      = [...new Set(sessions.map(s => s.title as string))];

  // ── Round 2: counts, personalization, prev photos, past sessions ──────────────
  const [attRes, , userSessRes, userEvtRes, prevPhotoRes, pastSessRes] = await Promise.all([
    // All attendance counts for upcoming sessions
    sessionIds.length
      ? db.from("session_attendance").select("session_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),

    Promise.resolve({ data: null }),

    // User's registrations for upcoming sessions
    userEmail && sessionIds.length
      ? db.from("session_attendance")
          .select("session_id")
          .eq("user_email", userEmail.toLowerCase())
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),

    // User's event registrations
    userEmail && eventIds.length
      ? db.from("event_registrations")
          .select("event_id")
          .eq("user_email", userEmail.toLowerCase())
          .in("event_id", eventIds)
          .in("status", ["confirmed", "pending"])
      : Promise.resolve({ data: [] }),

    // Most recent photo from past sessions for titles that have no current photo
    titlesWithoutPhoto.length
      ? db.from("sessions")
          .select("title, photo_url")
          .in("title", titlesWithoutPhoto)
          .lt("date", today)
          .not("photo_url", "is", null)
          .order("date", { ascending: false })
          .limit(titlesWithoutPhoto.length * 5)
      : Promise.resolve({ data: [] }),

    // Past sessions IDs+titles for user attendance history
    userEmail && sessionTitles.length
      ? db.from("sessions")
          .select("id, title")
          .in("title", sessionTitles)
          .lt("date", today)
          .limit(300)
      : Promise.resolve({ data: [] }),
  ]);

  // ── Round 3: user's past attendance count (depends on pastSessRes) ────────────
  const pastIdToTitle: Record<string, string> = {};
  const pastIds: string[] = [];
  for (const s of (pastSessRes.data ?? [])) {
    pastIdToTitle[s.id as string] = s.title as string;
    pastIds.push(s.id as string);
  }
  const userPastAttRes = userEmail && pastIds.length
    ? await db.from("session_attendance")
        .select("session_id")
        .eq("user_email", userEmail.toLowerCase())
        .in("session_id", pastIds)
    : { data: [] };

  // ── Build maps ────────────────────────────────────────────────────────────────
  const sessionCountMap: Record<string, number> = {};
  for (const r of (attRes.data ?? [])) {
    sessionCountMap[r.session_id as string] = (sessionCountMap[r.session_id as string] ?? 0) + 1;
  }

  const prevPhotoMap: Record<string, string> = {};
  for (const r of (prevPhotoRes.data ?? [])) {
    if (r.photo_url && !prevPhotoMap[r.title as string]) {
      prevPhotoMap[r.title as string] = r.photo_url as string;
    }
  }

  // ── Keyword fallback: fill photos for titles that exact-match missed ──────
  const stillMissingTitles = titlesWithoutPhoto.filter(t => !prevPhotoMap[t]);
  if (stillMissingTitles.length > 0) {
    const kwToTitles: Record<string, string[]> = {};
    for (const title of stillMissingTitles) {
      const kw = extractKeyword(title);
      if (kw) (kwToTitles[kw] ??= []).push(title);
    }
    await Promise.all(
      Object.keys(kwToTitles).map(async (kw) => {
        const { data: kwData } = await db
          .from("sessions")
          .select("photo_url")
          .ilike("title", `%${kw}%`)
          .lt("date", today)
          .not("photo_url", "is", null)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (kwData?.photo_url) {
          for (const title of kwToTitles[kw]) {
            prevPhotoMap[title] = kwData.photo_url as string;
          }
        }
      })
    );
  }

  const userCountByTitle: Record<string, number> = {};
  for (const r of (userPastAttRes.data ?? [])) {
    const title = pastIdToTitle[r.session_id as string];
    if (title) userCountByTitle[title] = (userCountByTitle[title] ?? 0) + 1;
  }

  const regSessionSet = new Set((userSessRes.data ?? []).map((r) => r.session_id as string));
  const regEventSet   = new Set((userEvtRes.data ?? []).map((r) => r.event_id as string));

  // ── Build response items ──────────────────────────────────────────────────────
  const sessionItems = sessions.map((s) => ({
    kind:               "session" as const,
    id:                 s.id as string,
    title:              s.title as string,
    date:               s.date as string,
    time:               (s.time  ?? null) as string | null,
    venue:              (s.venue ?? null) as string | null,
    location:           s.location as string,
    photo_url:          (s.photo_url ?? prevPhotoMap[s.title as string] ?? null) as string | null,
    registered_count:   sessionCountMap[s.id as string] ?? 0,
    registered:         regSessionSet.has(s.id as string),
    user_session_count: userCountByTitle[s.title as string] ?? 0,
  }));

  const eventItems = events.map((e) => ({
    kind:                  "event" as const,
    id:                    e.id as string,
    title:                 e.title as string,
    event_type:            e.event_type as string,
    cover_image:           (e.cover_image ?? null) as string | null,
    date:                  e.start_date as string,
    time:                  (e.start_time ?? null) as string | null,
    location:              e.location as string,
    price:                 (e.price ?? 0) as number,
    max_participants:      (e.max_participants ?? null) as number | null,
    participant_count:     (e.participant_count ?? 0) as number,
    share_slug:            (e.share_slug ?? null) as string | null,
    registration_required: (e.registration_required ?? true) as boolean,
    registered:            regEventSet.has(e.id as string),
  }));

  // Registered items first, then sort by date
  const items = [...sessionItems, ...eventItems].sort((a, b) => {
    if (a.registered !== b.registered) return a.registered ? -1 : 1;
    return a.date.localeCompare(b.date);
  });

  return NextResponse.json({ items });
}
