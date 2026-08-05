import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { thumbUrl } from "@/lib/thumb-url";

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
      .select("id, title, date, time, venue, location, cover_image_url, photo_url, difficulty")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(8),

    db.from("events")
      .select("id, title, event_type, cover_image, start_date, start_time, location, price, early_bird_ends_at, registration_closes_at, distance_categories, max_participants, participant_count, featured, share_slug, registration_required")
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
  const titlesWithoutPhoto = [...new Set(sessions.filter(s => !s.cover_image_url && !s.photo_url).map(s => s.title as string))];
  const sessionTitles      = [...new Set(sessions.map(s => s.title as string))];

  // ── Round 2: counts, personalization, prev photos, past sessions ──────────────
  const [attRes, raceRes, userSessRes, userEvtRes, prevPhotoRes, pastSessRes] = await Promise.all([
    // All attendance counts for upcoming sessions
    sessionIds.length
      ? db.from("session_attendance").select("session_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),

    // Min race prices for event cards (events.price may be stale vs event_races.price)
    eventIds.length
      ? db.from("event_races").select("event_id, price, early_bird_price").in("event_id", eventIds).eq("status", "active")
      : Promise.resolve({ data: [] }),

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
          .select("title, location, photo_url")
          .in("title", titlesWithoutPhoto)
          .lt("date", today)
          .not("photo_url", "is", null)
          .order("date", { ascending: false })
          .limit(titlesWithoutPhoto.length * 10)
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

  // Two-tier photo map: (title+location) preferred over (title-only)
  const prevPhotoByTitleLoc: Record<string, string> = {};
  const prevPhotoByTitle: Record<string, string> = {};
  for (const r of (prevPhotoRes.data ?? [])) {
    if (r.photo_url) {
      const tlKey = `${r.title as string}||${(r.location as string) ?? ""}`;
      if (!prevPhotoByTitleLoc[tlKey]) prevPhotoByTitleLoc[tlKey] = r.photo_url as string;
      if (!prevPhotoByTitle[r.title as string]) prevPhotoByTitle[r.title as string] = r.photo_url as string;
    }
  }
  // Keep prevPhotoMap as alias for keyword fallback compat
  const prevPhotoMap = prevPhotoByTitle;

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
    photo_url:          thumbUrl(
      (s.cover_image_url as string | null) ??
      (s.photo_url as string | null) ??
      prevPhotoByTitleLoc[`${s.title as string}||${s.location as string}`] ??
      prevPhotoMap[s.title as string] ??
      null
    ),
    difficulty:         (s.difficulty ?? null) as string | null,
    registered_count:   sessionCountMap[s.id as string] ?? 0,
    registered:         regSessionSet.has(s.id as string),
    user_session_count: userCountByTitle[s.title as string] ?? 0,
  }));

  // Build race price map: event_id → actual min price from event_races
  const racePriceMap: Record<string, { min_price: number; min_early_bird_price: number | null; has_multiple_prices: boolean; early_bird_active: boolean }> = {};
  for (const race of (raceRes.data ?? [])) {
    const eid   = race.event_id as string;
    const price = race.price as number;
    const eb    = race.early_bird_price as number | null;
    if (!racePriceMap[eid]) {
      racePriceMap[eid] = { min_price: price, min_early_bird_price: eb, has_multiple_prices: false, early_bird_active: false };
    } else {
      if (price !== racePriceMap[eid].min_price) racePriceMap[eid].has_multiple_prices = true;
      if (price < racePriceMap[eid].min_price) racePriceMap[eid].min_price = price;
      if (eb !== null && (racePriceMap[eid].min_early_bird_price === null || eb < (racePriceMap[eid].min_early_bird_price as number))) {
        racePriceMap[eid].min_early_bird_price = eb;
      }
    }
  }
  for (const e of events) {
    const entry = racePriceMap[e.id as string];
    if (!entry) continue;
    const ebEndsAt = e.early_bird_ends_at as string | null;
    entry.early_bird_active = !!(
      ebEndsAt &&
      new Date(ebEndsAt) > new Date() &&
      entry.min_early_bird_price !== null &&
      entry.min_early_bird_price < entry.min_price
    );
  }

  const eventItems = events.map((e) => {
    const eid  = e.id as string;
    const info = racePriceMap[eid];
    const minPrice = info ? info.min_price : (e.price ?? 0) as number;
    return {
      kind:                  "event" as const,
      id:                    eid,
      title:                 e.title as string,
      event_type:            e.event_type as string,
      cover_image:           (e.cover_image ?? null) as string | null,
      date:                  e.start_date as string,
      time:                  (e.start_time ?? null) as string | null,
      location:              e.location as string,
      price:                 minPrice,
      early_bird_price:      (info?.early_bird_active && info.min_early_bird_price !== null) ? info.min_early_bird_price : null,
      early_bird_active:     info?.early_bird_active ?? false,
      has_multiple_prices:   info?.has_multiple_prices ?? false,
      registration_closes_at: (e.registration_closes_at ?? null) as string | null,
      distance_categories:   (e.distance_categories ?? null) as string[] | null,
      featured:              (e.featured ?? false) as boolean,
      max_participants:      (e.max_participants ?? null) as number | null,
      participant_count:     (e.participant_count ?? 0) as number,
      share_slug:            (e.share_slug ?? null) as string | null,
      registration_required: (e.registration_required ?? true) as boolean,
      registered:            regEventSet.has(eid),
    };
  });

  // Registered items first, then sort by date
  const items = [...sessionItems, ...eventItems].sort((a, b) => {
    if (a.registered !== b.registered) return a.registered ? -1 : 1;
    return a.date.localeCompare(b.date);
  });

  return NextResponse.json({ items });
}
