import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json({ counts: {} });

  const sessionIds = ids.split(",").filter(Boolean);
  if (!sessionIds.length) return NextResponse.json({ counts: {} });

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

  return NextResponse.json({ counts });
}
