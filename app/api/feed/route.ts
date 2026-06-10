import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── GET /api/feed ─────────────────────────────────────────────────────────────
// Params:
//   email  – current user email (for reactions + scope=following filter)
//   scope  – "following" | "global"  (default: "following")
//   before – ISO timestamp cursor    (default: now)
//   limit  – items per page          (default: 15, max: 30)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email  = searchParams.get("email") ?? "";
    const scope  = (searchParams.get("scope") ?? "following") as "following" | "global";
    const before = searchParams.get("before") ?? new Date().toISOString();
    const limit  = Math.min(Number(searchParams.get("limit") ?? PAGE_SIZE), 30);

    const db = getSupabaseServer();

    // ── Build the pool of emails to include in the feed ───────────────────────
    let emailPool: string[] = [];

    if (scope === "global") {
      // All users on the platform
      const { data: allUsers } = await db.from("users").select("email");
      emailPool = (allUsers ?? []).map(u => u.email);
    } else {
      // Only people the current user follows
      const { data: followRows } = await db
        .from("follows")
        .select("following_email")
        .eq("follower_email", email);
      emailPool = (followRows ?? []).map(r => r.following_email);
      if (emailPool.length === 0) return NextResponse.json({ events: [], next_cursor: null, has_more: false });
    }

    // ── Fetch raw event sources in parallel ───────────────────────────────────

    const fetchSize = limit * 3; // over-fetch to allow for deduplication and sorting

    const [attendanceRes, photosRes, newMembersRes, userPostsRes] = await Promise.all([
      // Session attendance events
      db
        .from("session_attendance")
        .select("user_email, user_name, sessions(id, title, date, venue, photo_url)")
        .in("user_email", emailPool)
        .eq("attended", true)
        .lt("sessions(date)", before.slice(0, 10))
        .order("sessions(date)", { ascending: false })
        .limit(fetchSize),

      // Photo upload events
      db
        .from("session_photos")
        .select("id, uploader_email, uploader_name, session_id, photo_url, caption, created_at, sessions(title)")
        .in("uploader_email", emailPool)
        .lt("created_at", before)
        .order("created_at", { ascending: false })
        .limit(fetchSize),

      // New member join events
      db
        .from("users")
        .select("email, first_name, last_name, created_at")
        .in("email", emailPool)
        .lt("created_at", before)
        .order("created_at", { ascending: false })
        .limit(20),

      // User-generated posts
      db
        .from("user_posts")
        .select("id, author_email, author_name, post_type, body, photo_url, created_at")
        .in("author_email", emailPool)
        .eq("approved", true)
        .lt("created_at", before)
        .order("created_at", { ascending: false })
        .limit(fetchSize),
    ]);

    // ── Build event objects ───────────────────────────────────────────────────

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

    // Badge earned: for each user in the pool, compute which session milestone
    // they've most recently crossed and synthesise a badge event.
    await appendBadgeEvents(db, emailPool, before, events);

    // ── Sort descending, paginate ─────────────────────────────────────────────

    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const page      = events.slice(0, limit);
    const has_more  = events.length > limit;
    const last      = page[page.length - 1];
    const next_cursor = has_more && last ? last.created_at : null;

    // ── Attach reaction counts ────────────────────────────────────────────────

    const eventIds = page.map(e => e.id);
    const reactionsRes = await db
      .from("feed_reactions")
      .select("feed_event_id, reaction_type, user_email")
      .in("feed_event_id", eventIds);

    const reactionMap: Record<string, { like: number; celebrate: number; my_reaction: "like" | "celebrate" | null }> = {};
    for (const r of reactionsRes.data ?? []) {
      if (!reactionMap[r.feed_event_id]) reactionMap[r.feed_event_id] = { like: 0, celebrate: 0, my_reaction: null };
      reactionMap[r.feed_event_id][r.reaction_type as "like" | "celebrate"]++;
      if (r.user_email === email) reactionMap[r.feed_event_id].my_reaction = r.reaction_type as "like" | "celebrate";
    }

    const result: FeedEvent[] = page.map(e => ({
      ...e,
      reactions: reactionMap[e.id] ?? { like: 0, celebrate: 0, my_reaction: null },
    }));

    return NextResponse.json({ events: result, next_cursor, has_more });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── Badge event synthesis ─────────────────────────────────────────────────────

async function appendBadgeEvents(
  db: ReturnType<typeof getSupabaseServer>,
  emailPool: string[],
  before: string,
  events: Omit<FeedEvent, "reactions">[]
) {
  if (emailPool.length === 0) return;

  // For each user, count their total attended sessions
  const { data: counts } = await db
    .from("session_attendance")
    .select("user_email, user_name")
    .in("user_email", emailPool)
    .eq("attended", true);

  if (!counts?.length) return;

  // Group by user_email and count
  const userCounts: Record<string, { name: string; count: number }> = {};
  for (const row of counts) {
    if (!userCounts[row.user_email]) userCounts[row.user_email] = { name: row.user_name ?? "", count: 0 };
    userCounts[row.user_email].count++;
  }

  // For each user whose count hits a milestone, find the date of that nth session
  // and emit a badge event (only for milestones reached within the past 60 days)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  for (const [userEmail, { name, count }] of Object.entries(userCounts)) {
    // Find the highest milestone this user has crossed
    const milestones = MILESTONE_COUNTS.filter(m => count >= m);
    if (milestones.length === 0) continue;
    const topMilestone = milestones[milestones.length - 1];

    // Get the date of their nth (topMilestone-th) session to use as the badge timestamp
    const { data: nthSession } = await db
      .from("session_attendance")
      .select("sessions(date)")
      .eq("user_email", userEmail)
      .eq("attended", true)
      .order("sessions(date)", { ascending: true })
      .range(topMilestone - 1, topMilestone - 1)
      .single();

    if (!nthSession) continue;
    const raw  = nthSession.sessions as unknown;
    const sess = (Array.isArray(raw) ? raw[0] : raw) as { date: string } | null;
    if (!sess) continue;

    const badgeDate = sess.date + "T07:00:00.000Z";
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
