import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// Runs on the 1st of every month at 00:05 IST (18:35 UTC prev day) via Vercel Cron.
// Snapshots current monthly ranks into prev_month_rank so movement indicators
// on the leaderboard reflect how each user moved vs the previous month.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Fetch all leaderboard entries ordered by month_points
  const { data: entries, error } = await db
    .from("leaderboard")
    .select("user_email, month_points")
    .order("month_points", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entries?.length) return NextResponse.json({ ok: true, updated: 0 });

  // Assign competition ranks (tied scores share the same rank)
  const ranked: { user_email: string; rank: number }[] = [];
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].month_points < entries[i - 1].month_points) rank = i + 1;
    ranked.push({ user_email: entries[i].user_email, rank });
  }

  // Batch-update prev_month_rank for all users
  const updates = ranked.map(r =>
    db.from("leaderboard").update({ prev_month_rank: r.rank }).eq("user_email", r.user_email)
  );

  await Promise.allSettled(updates);

  console.log(`Rank snapshot: ${ranked.length} users updated`);
  return NextResponse.json({ ok: true, updated: ranked.length });
}
