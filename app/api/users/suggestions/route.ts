import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/users/suggestions?email=
// Returns up to 6 users with same location who the current user doesn't already follow
export async function GET(req: NextRequest) {
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ users: [] });

    const db = getSupabaseServer();

    // Get current user's location and goal
    const { data: me } = await db
      .from("users")
      .select("location, goal")
      .eq("email", email)
      .single();

    // Get who they already follow
    const { data: followRows } = await db
      .from("follows")
      .select("following_email")
      .eq("follower_email", email);

    const alreadyFollowing = new Set((followRows ?? []).map(r => r.following_email));
    alreadyFollowing.add(email); // exclude self

    // Find runners from leaderboard with same location
    const { data: nearby } = await db
      .from("leaderboard")
      .select("user_email, user_name, location, total_points")
      .eq("location", me?.location ?? "")
      .order("total_points", { ascending: false })
      .limit(20);

    const suggestions = (nearby ?? [])
      .filter(u => !alreadyFollowing.has(u.user_email))
      .slice(0, 6)
      .map(u => ({ email: u.user_email, name: u.user_name, location: u.location, points: u.total_points }));

    // If fewer than 3 from same location, top up from same goal
    if (suggestions.length < 3 && me?.goal) {
      const { data: goalPeers } = await db
        .from("users")
        .select("email, first_name, last_name")
        .eq("goal", me.goal)
        .limit(20);

      const existing = new Set([...alreadyFollowing, ...suggestions.map(s => s.email)]);
      for (const u of goalPeers ?? []) {
        if (existing.has(u.email)) continue;
        suggestions.push({ email: u.email, name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(), location: "", points: 0 });
        if (suggestions.length >= 6) break;
      }
    }

    return NextResponse.json({ users: suggestions });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
