import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { cacheGet, cacheSet, CK, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json({ counts: {} });

  const sessionIds = ids.split(",").filter(Boolean);
  if (!sessionIds.length) return NextResponse.json({ counts: {} });

  const cacheKey = CK.sessionRsvpCounts(sessionIds);

  // ── Cache read ──────────────────────────────────────────────────────────────
  const cached = await cacheGet<{ counts: Record<string, number> }>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const db = getSupabaseServer();
  const { data } = await db
    .from("session_attendance")
    .select("session_id")
    .in("session_id", sessionIds);

  const counts: Record<string, number> = {};
  for (const id of sessionIds) counts[id] = 0;
  for (const row of data ?? []) {
    counts[row.session_id] = (counts[row.session_id] ?? 0) + 1;
  }

  const body = { counts };
  void cacheSet(cacheKey, body, TTL.sessionRsvpCounts);

  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}
