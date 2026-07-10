import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseServer();

  const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = istNow.toISOString().split("T")[0];
  const nowMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const nowTime = `${String(istNow.getUTCHours()).padStart(2, "0")}:${String(istNow.getUTCMinutes()).padStart(2, "0")}`;

  const userToken  = req.headers.get("x-user-token");
  const userEmail  = userToken ? verifyUserToken(userToken) : null;

  // Fetch sessions + events in parallel
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

  const events = evtRes.data ?? [];

  // Personalization: registration status + session counts in one round-trip each
  const sessionIds = sessions.map((s) => s.id);
  const eventIds   = events.map((e) => e.id);

  const [attRes, regRes, userSessRes, userEvtRes] = await Promise.all([
    // Session attendance counts (all registrations per session)
    sessionIds.length
      ? db.from("session_attendance").select("session_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),

    // Events: registered slot count is already in participant_count column — skip extra query
    Promise.resolve({ data: null }),

    // User's registered sessions
    userEmail && sessionIds.length
      ? db.from("session_attendance")
          .select("session_id")
          .eq("user_email", userEmail.toLowerCase())
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),

    // User's registered events
    userEmail && eventIds.length
      ? db.from("event_registrations")
          .select("event_id")
          .eq("user_email", userEmail.toLowerCase())
          .in("event_id", eventIds)
          .in("status", ["confirmed", "pending"])
      : Promise.resolve({ data: [] }),
  ]);
  void regRes;

  // Build count maps
  const sessionCountMap: Record<string, number> = {};
  for (const r of (attRes.data ?? [])) {
    sessionCountMap[r.session_id] = (sessionCountMap[r.session_id] ?? 0) + 1;
  }

  const regSessionSet = new Set((userSessRes.data ?? []).map((r) => r.session_id));
  const regEventSet   = new Set((userEvtRes.data ?? []).map((r) => r.event_id));

  const sessionItems = sessions.map((s) => ({
    kind:             "session" as const,
    id:               s.id,
    title:            s.title,
    date:             s.date,
    time:             s.time   ?? null,
    venue:            s.venue  ?? null,
    location:         s.location,
    photo_url:        s.photo_url ?? null,
    registered_count: sessionCountMap[s.id] ?? 0,
    registered:       regSessionSet.has(s.id),
  }));

  const eventItems = events.map((e) => ({
    kind:              "event" as const,
    id:                e.id,
    title:             e.title,
    event_type:        e.event_type,
    cover_image:       e.cover_image ?? null,
    date:              e.start_date,
    time:              e.start_time   ?? null,
    location:          e.location,
    price:             e.price          ?? 0,
    max_participants:  e.max_participants  ?? null,
    participant_count: e.participant_count ?? 0,
    share_slug:        e.share_slug       ?? null,
    registration_required: e.registration_required ?? true,
    registered:        regEventSet.has(e.id),
  }));

  // Merge: registered items first, then sort by date
  const items = [...sessionItems, ...eventItems].sort((a, b) => {
    if (a.registered !== b.registered) return a.registered ? -1 : 1;
    return a.date.localeCompare(b.date);
  });

  return NextResponse.json({ items });
}
