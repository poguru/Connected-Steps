import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paginateAll } from "@/lib/paginate";

// Runs on the 1st of every month at 00:05 IST (18:35 UTC prev day) via Vercel Cron.
// Snapshots current monthly ranks into prev_month_rank so movement indicators
// on the leaderboard reflect how each user moved vs the previous month.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const db = getSupabaseServer();

  // Paginated: leaderboard can exceed default row limit at scale.
  const { rows: entries, pages } = await paginateAll<{ user_email: string; month_points: number }>(
    (from, to) =>
      db.from("leaderboard")
        .select("user_email, month_points")
        .order("month_points", { ascending: false })
        .order("user_email")           // secondary sort for stable pagination
        .range(from, to),
  );

  if (!entries.length) {
    console.log(`[rank-snapshot] no entries found duration=${Date.now() - startMs}ms`);
    return NextResponse.json({ ok: true, updated: 0 });
  }

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

  console.log(
    `[rank-snapshot] users=${ranked.length} pages=${pages}` +
    ` duration=${Date.now() - startMs}ms`,
  );
  return NextResponse.json({ ok: true, updated: ranked.length });
}
