import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notify-inapp";

const SESSION_BADGES = [
  { id: "first_session",  threshold: 1,  label: "First Session 🎯" },
  { id: "five_sessions",  threshold: 5,  label: "5 Sessions 🌟" },
  { id: "ten_sessions",   threshold: 10, label: "10 Sessions 💪" },
  { id: "25_sessions",    threshold: 25, label: "25 Sessions 🔑" },
  { id: "50_sessions",    threshold: 50, label: "50 Sessions 🏅" },
];

const LEADERBOARD_BADGES = [
  { id: "top_10",   threshold: 10, label: "Top 10 📊" },
  { id: "podium",   threshold: 3,  label: "Podium Finish 🥉" },
  { id: "champion", threshold: 1,  label: "Champion 👑" },
];

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db  = getSupabaseServer();
  const key = email.toLowerCase();

  const [sessionRes, leaderboardRes, membershipRes, storedRes] = await Promise.all([
    db.from("session_attendance").select("attended").eq("user_email", key).eq("attended", true),
    db.from("leaderboard").select("month_points").eq("user_email", key).single(),
    db.from("memberships").select("status, expires_at").eq("user_email", key).single(),
    db.from("user_achievements").select("badge_id").eq("user_email", key),
  ]);

  // Leaderboard rank
  let leaderboardRank: number | null = null;
  if (leaderboardRes.data) {
    const { count } = await db
      .from("leaderboard")
      .select("*", { count: "exact", head: true })
      .gt("month_points", leaderboardRes.data.month_points);
    leaderboardRank = (count ?? 0) + 1;
  }

  const sessionCount  = sessionRes.data?.length ?? 0;
  const hasMembership = !!(membershipRes.data?.status === "active" && new Date(membershipRes.data.expires_at) > new Date());
  const alreadyEarned = new Set((storedRes.data ?? []).map(r => r.badge_id));

  // Compute newly unlocked badges
  const newlyUnlocked: { id: string; label: string }[] = [];

  for (const b of SESSION_BADGES) {
    if (sessionCount >= b.threshold && !alreadyEarned.has(b.id)) {
      newlyUnlocked.push(b);
    }
  }
  for (const b of LEADERBOARD_BADGES) {
    if (leaderboardRank !== null && leaderboardRank <= b.threshold && !alreadyEarned.has(b.id)) {
      newlyUnlocked.push(b);
    }
  }
  if (hasMembership && !alreadyEarned.has("active_member")) {
    newlyUnlocked.push({ id: "active_member", label: "Active Member 💳" });
  }

  // Persist and notify new unlocks (fire-and-forget)
  if (newlyUnlocked.length > 0) {
    const persist = async () => {
      for (const badge of newlyUnlocked) {
        const { error } = await db
          .from("user_achievements")
          .insert({ user_email: key, badge_id: badge.id })
          .select()
          .single();
        if (!error) {
          createNotification({
            user_email: key,
            type:       "achievement",
            title:      "Badge Unlocked!",
            body:       `You earned the ${badge.label} badge.`,
            action_url: "/achievements",
          }).catch(() => {});
        }
      }
    };
    persist().catch(console.error);
  }

  return NextResponse.json({ sessionCount, leaderboardRank, hasMembership });
}
