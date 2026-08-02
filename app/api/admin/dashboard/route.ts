import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { cacheGet, cacheSet, CK, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = getSupabaseServer();
  const now = new Date();

  // IST-aware month boundary
  const istNow     = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const monthKey   = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(istNow.getFullYear(), istNow.getMonth(), 1).toISOString();
  const todayIST   = istNow.toISOString().split("T")[0];
  const nowISO     = now.toISOString();

  // ── Cache read ──────────────────────────────────────────────────────────────
  const cacheKey = CK.adminDashboard(monthKey);
  const cached   = await cacheGet<Record<string, number>>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const [
    totalMembersRes,
    activeMembersRes,
    newMembersRes,
    membershipRevenueRes,
    upcomingEventsRes,
    eventRevenueRes,
    upcomingRegistrationsRes,
    totalParticipantsRes,
    pendingStoriesRes,
    pendingPostsRes,
  ] = await Promise.all([
    // 1. Total registered users
    db.from("users").select("email", { count: "exact", head: true }),

    // 2. Active paid members right now
    db.from("memberships")
      .select("user_email", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", nowISO),

    // 3. New memberships purchased this month (count)
    db.from("memberships")
      .select("user_email", { count: "exact", head: true })
      .gte("started_at", monthStart)
      .eq("status", "active"),

    // 4. Membership revenue this month — amount_paid is stored in PAISE → ÷100 for rupees
    db.from("memberships")
      .select("amount_paid")
      .gte("started_at", monthStart)
      .eq("status", "active"),

    // 5. Upcoming published events (starting today or later)
    db.from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("start_date", todayIST),

    // 6. Event registration revenue this month — final_price stored in RUPEES
    db.from("event_registrations")
      .select("final_price")
      .gte("created_at", monthStart)
      .in("payment_status", ["paid", "free"]),

    // 7. Total confirmed registrations (one row per booking, including multi-person bookings)
    db.from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed"),

    // 8. Total active participant slots across all events.
    // event_participants has one row per PHYSICAL PERSON — correctly counts multi-participant
    // registrations (duo/family) where a single booking covers > 1 person.
    db.from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),

    // 9. Pending story approvals
    db.from("stories")
      .select("id", { count: "exact", head: true })
      .is("approved", null),

    // 10. Pending community post approvals
    db.from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("approved", false),
  ]);

  // Membership revenue: amount_paid is in paise → divide by 100
  const membershipRevenueMonth = Math.round(
    (membershipRevenueRes.data ?? []).reduce((s, m) => s + (m.amount_paid ?? 0), 0) / 100
  );

  // Event revenue: final_price is in rupees
  const eventRevenueMonth = (eventRevenueRes.data ?? [])
    .reduce((s, r) => s + (r.final_price ?? 0), 0);

  const totalRevenueMonth = membershipRevenueMonth + eventRevenueMonth;

  const body = {
    // Counts
    totalMembers:              totalMembersRes.count            ?? 0,
    activeMembers:             activeMembersRes.count           ?? 0,
    newMembersThisMonth:       newMembersRes.count              ?? 0,
    upcomingEvents:            upcomingEventsRes.count          ?? 0,
    upcomingRegistrations:     upcomingRegistrationsRes.count   ?? 0,
    totalParticipants:         totalParticipantsRes.count       ?? 0,
    pendingStories:            pendingStoriesRes.count          ?? 0,
    pendingPosts:              pendingPostsRes.count            ?? 0,

    // Revenue (all in rupees)
    membershipRevenueMonth,
    eventRevenueMonth,
    totalRevenueMonth,
  };

  void cacheSet(cacheKey, body, TTL.adminDashboard);

  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}
