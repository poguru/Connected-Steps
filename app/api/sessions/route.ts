import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { thumbUrl } from "@/lib/thumb-url";

export const revalidate = 300;

const PHOTO_KEYWORDS = ["recovery", "mobility", "strength", "conditioning", "interval", "speed", "agility", "endurance", "long run", "hill", "trail"];

function extractKeyword(title: string): string | null {
  const t = title.toLowerCase();
  for (const kw of PHOTO_KEYWORDS) if (t.includes(kw)) return kw;
  return null;
}

export async function GET() {
  const db = getSupabaseServer();

  const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = istNow.toISOString().split("T")[0];
  const nowMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  const { data, error } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location, cover_image_url, photo_url, difficulty")
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const GRACE_MINS = 120;
  const filtered = (data ?? []).filter((s) => {
    if (s.date !== today) return true;
    if (!s.time) return true;
    const [sh, sm] = (s.time as string).split(":").map(Number);
    return nowMins < sh * 60 + sm + GRACE_MINS;
  });

  if (filtered.length === 0) return NextResponse.json({ data: [] });

  const sessionIds    = filtered.map(s => s.id as string);
  // Only fall back to previous sessions for titles without ANY cover (cover_image_url preferred, then photo_url)
  const noPhotoTitles = [...new Set(filtered.filter(s => !s.cover_image_url && !s.photo_url).map(s => s.title as string))];

  // â”€â”€ Round 2: attendance counts + exact-title photo fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [attRes, prevPhotoRes] = await Promise.all([
    db.from("session_attendance").select("session_id").in("session_id", sessionIds),

    noPhotoTitles.length
      ? db.from("sessions")
          .select("title, location, photo_url")
          .in("title", noPhotoTitles)
          .lt("date", today)
          .not("photo_url", "is", null)
          .order("date", { ascending: false })
          .limit(noPhotoTitles.length * 10)
      : Promise.resolve({ data: [] }),
  ]);

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
  const prevPhotoMap = prevPhotoByTitle;

  // â”€â”€ Round 3: keyword fallback for titles still missing a photo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stillMissing = noPhotoTitles.filter(t => !prevPhotoMap[t]);
  if (stillMissing.length > 0) {
    const kwToTitles: Record<string, string[]> = {};
    for (const title of stillMissing) {
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

  // Build attendance map
  const attMap: Record<string, number> = {};
  for (const r of (attRes.data ?? [])) {
    attMap[r.session_id as string] = (attMap[r.session_id as string] ?? 0) + 1;
  }

  const result = filtered.map(s => ({
    id:               s.id as string,
    title:            s.title as string,
    date:             s.date as string,
    time:             (s.time ?? null) as string | null,
    venue:            (s.venue ?? null) as string | null,
    location:         s.location as string,
    photo_url:        thumbUrl(
      (s.cover_image_url as string | null) ??
      (s.photo_url as string | null) ??
      prevPhotoByTitleLoc[`${s.title as string}||${s.location as string}`] ??
      prevPhotoMap[s.title as string] ??
      null
    ),
    registered_count: attMap[s.id as string] ?? 0,
    difficulty:       (s.difficulty ?? null) as string | null,
  }));

  return NextResponse.json({ data: result });
}
