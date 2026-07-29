import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/share-analytics?days=30
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const db = getSupabaseServer();

  const [totalRes, platformRes, typeRes, topContentRes, dailyRes] = await Promise.all([
    // Total share count
    db.from("share_events").select("*", { count: "exact", head: true }).gte("created_at", since),

    // Breakdown by platform
    db.rpc("json_agg_share_by_platform" as never, {} as never).select("*") // fallback below
      .then(() => db.from("share_events").select("platform").gte("created_at", since)),

    // Breakdown by content type
    db.from("share_events").select("content_type").gte("created_at", since),

    // Top shared content_ids
    db.from("share_events").select("content_type, content_id").gte("created_at", since).limit(1000),

    // Daily trend (last 14 days)
    db.from("share_events").select("created_at").gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString()),
  ]);

  const total = totalRes.count ?? 0;

  // Platform counts
  const platformCounts: Record<string, number> = {};
  for (const row of (platformRes.data ?? [])) {
    const p = (row as { platform: string }).platform;
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
  }

  // Type counts
  const typeCounts: Record<string, number> = {};
  for (const row of (typeRes.data ?? [])) {
    const t = (row as { content_type: string }).content_type;
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  // Top content
  const contentMap: Record<string, number> = {};
  for (const row of (topContentRes.data ?? [])) {
    const r = row as { content_type: string; content_id: string };
    const key = `${r.content_type}:${r.content_id}`;
    contentMap[key] = (contentMap[key] ?? 0) + 1;
  }
  const topContent = Object.entries(contentMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => { const [type, id] = key.split(":"); return { type, id, count }; });

  // Daily trend
  const dayCounts: Record<string, number> = {};
  for (const row of (dailyRes.data ?? [])) {
    const day = (row as { created_at: string }).created_at.slice(0, 10);
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const dailyTrend = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return { date: d, count: dayCounts[d] ?? 0 };
  });

  return NextResponse.json({ total, platformCounts, typeCounts, topContent, dailyTrend, days });
}
