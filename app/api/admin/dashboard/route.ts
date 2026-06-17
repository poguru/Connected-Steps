import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = now.toISOString().split("T")[0];

  const [
    totalRes,
    activeRes,
    eventsRes,
    revenueRes,
    storiesRes,
    postsRes,
  ] = await Promise.all([
    db.from("users").select("email", { count: "exact", head: true }),
    db.from("memberships").select("user_email", { count: "exact", head: true })
      .eq("status", "active").gt("expires_at", now.toISOString()),
    db.from("events").select("id", { count: "exact", head: true })
      .gte("start_date", today),
    db.from("memberships").select("amount_paid")
      .gte("created_at", monthStart),
    db.from("stories").select("id", { count: "exact", head: true })
      .is("approved", null),
    db.from("community_posts").select("id", { count: "exact", head: true })
      .eq("approved", false),
  ]);

  const revenueThisMonth = (revenueRes.data ?? []).reduce((s, m) => s + (m.amount_paid ?? 0), 0);

  return NextResponse.json({
    totalMembers:     totalRes.count   ?? 0,
    activeMembers:    activeRes.count  ?? 0,
    upcomingEvents:   eventsRes.count  ?? 0,
    revenueThisMonth,
    pendingStories:   storiesRes.count ?? 0,
    pendingPosts:     postsRes.count   ?? 0,
  });
}
