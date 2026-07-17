import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type EventType =
  | "session_attended"
  | "photo_uploaded"
  | "badge_earned"
  | "member_joined"
  | "user_post";

export interface FeedEvent {
  id:          string;
  actor_email: string;
  actor_name:  string;
  event_type:  EventType;
  payload:     Record<string, string | number>;
  created_at:  string;
  reactions:   { like: number; celebrate: number; my_reaction: "like" | "celebrate" | null };
}

// Session milestone badges (matches Achievements.tsx)
const SESSION_BADGES: Record<number, { label: string; icon: string }> = {
  1:  { label: "First Session",   icon: "🎯" },
  5:  { label: "5 Sessions",      icon: "🌟" },
  10: { label: "10 Sessions",     icon: "💪" },
  25: { label: "25 Sessions",     icon: "🔑" },
  50: { label: "50 Sessions",     icon: "🏅" },
};
const MILESTONE_COUNTS = [1, 5, 10, 25, 50];

const PAGE_SIZE = 15;

// â”€â”€ GET /api/feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Params:
//   email  â€“ current user email (for reactions + scope=following filter)
//   scope  â€“ "following" | "global"  (default: "following")
//   before â€“ ISO timestamp cursor    (default: now)
//   limit  â€“ items per page          (default: 15, max: 30)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email  = searchParams.get("email") ?? "";
    const scope  = (searchParams.get("scope") ?? "following") as "following" | "global";
    const before = searchParams.get("before") ?? new Date().toISOString();
    const limit  = Math.min(Number(searchParams.get("limit") ?? PAGE_SIZE), 30);

    const db = getSupabaseServer();

    // â”€â”€ Build the email pool (following scope only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Global scope: no email filter needed â€” query all events directly.
    // Following scope: filter by the set of people this user follows.

    let emailPool: string[] | null = null; // null = global (no filter)

    if (scope === "following") {
      const { data: followRows } = await db
        .from("follows")
        .select("following_email")
        .eq("follower_email", email);
      emailPool = (followRows ?? []).map(r => r.following_email);
      if (emailPool.length === 0) return NextResponse.json({ events: [], next_cursor: null, has_more: false });
    }

    // Look up the current user's primary training location for birthday post filtering
    let userLocationId: string | null = null;
    if (email) {
      const { data: locRow } = await db
        .from("user_location_assignments")
        .select("location_id")
        .eq("user_email", email)
        .eq("is_primary", true)
        .single();
      userLocationId = locRow?.location_id ?? null;
    }

    // â”€â”€ Fetch raw event sources in parallel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const fetchSize = limit * 3; // over-fetch to allow for deduplication and sorting

    const attendanceQ = db
      .from("session_attendance")
      .select("user_email, user_name, sessions(id, title, date, venue, photo_url)")
      .eq("attended", true)
      .lt("sessions(date)", before.slice(0, 10))
      .order("sessions(date)", { ascending: false })
      .limit(fetchSize);

    const photosQ = db
      .from("session_photos")
      .select("id, uploader_email, uploader_name, session_id, photo_url, caption, created_at, sessions(title)")
      .lt("created_at", before)
      .order("created_at", { ascending: false })
      .limit(fetchSize);

    const newMembersQ = db
      .from("users")
      .select("email, first_name, last_name, created_at")
      .lt("created_at", before)
      .order("created_at", { ascending: false })
      .limit(20);

    const postsQ = db
      .from("user_posts")
      .select("id, author_email, author_name, post_type, body, photo_url, location_id, created_at")
      .eq("approved", true)
      .lt("created_at", before)
      .order("created_at", { ascending: false })
      .limit(fetchSize);

    const [attendanceRes, photosRes, newMembersRes, userPostsRes] = await Promise.all([
      emailPool ? attendanceQ.in("user_email", emailPool) : attendanceQ,
      emailPool ? photosQ.in("uploader_email", emailPool) : photosQ,
      emailPool ? newMembersQ.in("email", emailPool) : newMembersQ,
      emailPool ? postsQ.in("author_email", emailPool) : postsQ,
    ]);

    // â”€â”€ Build event objects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const events: Omit<FeedEvent, "reactions">[] = [];

    // Session attended
    for (const s of attendanceRes.data ?? []) {
      const raw  = s.sessions as unknown;
      const sess = (Array.isArray(raw) ? raw[0] : raw) as {
        id: string; title: string; date: string; venue: string | null; photo_url: string | null;
      } | null;
      if (!sess) continue;
      events.push({
        id:          `session_${s.user_email}_${sess.id}`,
        actor_email: s.user_email,
        actor_name:  s.user_name ?? s.user_email.split("@")[0],
        event_type:  "session_attended",
        payload:     {
          session_title: sess.title,
          session_date:  sess.date,
          venue:         sess.venue ?? "",
          photo_url:     sess.photo_url ?? "",
        },
        created_at: sess.date + "T06:00:00.000Z",
      });
    }

    // Photo uploaded
    for (const p of photosRes.data ?? []) {
      const rawSess = p.sessions as unknown;
      const sess    = (Array.isArray(rawSess) ? rawSess[0] : rawSess) as { title: string } | null;
      events.push({
        id:          `photo_${p.id}`,
        actor_email: p.uploader_email,
        actor_name:  p.uploader_name ?? p.uploader_email.split("@")[0],
        event_type:  "photo_uploaded",
        payload:     {
          session_id:    p.session_id,
          photo_id:      p.id,
          photo_url:     p.photo_url,
          caption:       p.caption ?? "",
          session_title: sess?.title ?? "",
        },
        created_at: p.created_at,
      });
    }

    // Member joined (new members in last 30 days shown once)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    for (const u of newMembersRes.data ?? []) {
      if (u.created_at < thirtyDaysAgo) continue;
      events.push({
        id:          `joined_${u.email}`,
        actor_email: u.email,
        actor_name:  `${u.first_name} ${u.last_name}`.trim() || u.email.split("@")[0],
        event_type:  "member_joined",
        payload:     {},
        created_at:  u.created_at,
      });
    }

    // User-generated posts
    for (const p of userPostsRes.data ?? []) {
      // Birthday posts are location-scoped: only show to users at the same location
      if (p.post_type === "birthday") {
        if (!p.location_id || p.location_id !== userLocationId) continue;
      }
      events.push({
        id:          `post_${p.id}`,
        actor_email: p.author_email,
        actor_name:  p.author_name,
        event_type:  "user_post",
        payload:     {
          post_id:   p.id,
          post_type: p.post_type,
          body:      p.body,
          photo_url: p.photo_url ?? "",
        },
        created_at: p.created_at,
      });
    }

    // Badge earned: synthesise milestone badge events from session counts.
    await appendBadgeEvents(db, emailPool, before, events);

    // â”€â”€ Sort descending, paginate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const page      = events.slice(0, limit);
    const has_more  = events.length > limit;
    const last      = page[page.length - 1];
    const next_cursor = has_more && last ? last.created_at : null;

    // â”€â”€ Attach reaction counts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // user_post events store reactions in user_post_likes (via /api/posts/[id]/react).
    // All other event types use feed_reactions. Query both in parallel.
    const userPostEvents = page.filter(e => e.event_type === "user_post");
    const otherEvents    = page.filter(e => e.event_type !== "user_post");
    const otherEventIds  = otherEvents.map(e => e.id);
    const userPostIds    = userPostEvents.map(e => e.payload.post_id as string).filter(Boolean);

    const [reactionsRes, postLikesRes, postCommentsRes] = await Promise.all([
      otherEventIds.length
        ? db.from("feed_reactions").select("feed_event_id, reaction_type, user_email").in("feed_event_id", otherEventIds)
        : Promise.resolve({ data: [] as { feed_event_id: string; reaction_type: string; user_email: string }[], error: null }),
      userPostIds.length
        ? db.from("user_post_likes").select("post_id, reaction_type, user_email").in("post_id", userPostIds)
        : Promise.resolve({ data: [] as { post_id: string; reaction_type: string; user_email: string }[], error: null }),
      userPostIds.length
        ? db.from("user_post_comments").select("post_id").in("post_id", userPostIds)
        : Promise.resolve({ data: [] as { post_id: string }[], error: null }),
    ]);

    const reactionMap: Record<string, { like: number; celebrate: number; my_reaction: "like" | "celebrate" | null }> = {};

    for (const r of reactionsRes.data ?? []) {
      if (!reactionMap[r.feed_event_id]) reactionMap[r.feed_event_id] = { like: 0, celebrate: 0, my_reaction: null };
      reactionMap[r.feed_event_id][r.reaction_type as "like" | "celebrate"]++;
      if (r.user_email === email) reactionMap[r.feed_event_id].my_reaction = r.reaction_type as "like" | "celebrate";
    }

    // user_post reactions keyed by "post_" + post_id to match event.id
    for (const r of postLikesRes.data ?? []) {
      const eventId = `post_${r.post_id}`;
      if (!reactionMap[eventId]) reactionMap[eventId] = { like: 0, celebrate: 0, my_reaction: null };
      reactionMap[eventId][r.reaction_type as "like" | "celebrate"]++;
      if (r.user_email === email) reactionMap[eventId].my_reaction = r.reaction_type as "like" | "celebrate";
    }

    const commentCountMap: Record<string, number> = {};
    for (const c of postCommentsRes.data ?? []) {
      commentCountMap[c.post_id] = (commentCountMap[c.post_id] ?? 0) + 1;
    }

    const result: FeedEvent[] = page.map(e => {
      const reactions = reactionMap[e.id] ?? { like: 0, celebrate: 0, my_reaction: null };
      if (e.event_type === "user_post" && e.payload.post_id) {
        return { ...e, reactions, payload: { ...e.payload, comments_count: commentCountMap[e.payload.post_id as string] ?? 0 } };
      }
      return { ...e, reactions };
    });

    return NextResponse.json({ events: result, next_cursor, has_more });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// â”€â”€ Badge event synthesis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single query replaces the previous N+1 pattern (one per-user query for the nth session date).

async function appendBadgeEvents(
  db: ReturnType<typeof getSupabaseServer>,
  emailPool: string[] | null, // null = global scope
  before: string,
  events: Omit<FeedEvent, "reactions">[]
) {
  // One query: all attended sessions with dates for the relevant users.
  // emailPool=null means global; no IN filter needed.
  let q = db
    .from("session_attendance")
    .select("user_email, user_name, sessions(date)")
    .eq("attended", true);

  if (emailPool !== null) {
    if (emailPool.length === 0) return;
    q = q.in("user_email", emailPool);
  }

  const { data: allRows } = await q;
  if (!allRows?.length) return;

  // Build per-user list of sorted session dates in one pass.
  const userMap: Record<string, { name: string; dates: string[] }> = {};
  for (const row of allRows) {
    const raw  = row.sessions as unknown;
    const sess = (Array.isArray(raw) ? raw[0] : raw) as { date: string } | null;
    if (!sess?.date) continue;
    if (!userMap[row.user_email]) userMap[row.user_email] = { name: row.user_name ?? "", dates: [] };
    userMap[row.user_email].dates.push(sess.date);
  }

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  for (const [userEmail, { name, dates }] of Object.entries(userMap)) {
    dates.sort(); // ISO date strings sort correctly as strings
    const count       = dates.length;
    const milestones  = MILESTONE_COUNTS.filter(m => count >= m);
    if (milestones.length === 0) continue;
    const topMilestone = milestones[milestones.length - 1];

    const nthDate = dates[topMilestone - 1]; // 0-indexed into sorted array
    if (!nthDate) continue;

    const badgeDate = nthDate + "T07:00:00.000Z";
    if (badgeDate >= before || badgeDate < sixtyDaysAgo) continue;

    const badge = SESSION_BADGES[topMilestone];
    events.push({
      id:          `badge_${userEmail}_${topMilestone}`,
      actor_email: userEmail,
      actor_name:  name || userEmail.split("@")[0],
      event_type:  "badge_earned",
      payload:     { badge: badge.label, icon: badge.icon, count: topMilestone },
      created_at:  badgeDate,
    });
  }
}
