import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/user/points
// Returns the caller's points ledger entries with session info, newest first.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = verifyUserToken(token);
  if (!email) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const db = getSupabaseServer();

  const { data: entries, error } = await db
    .from("points_ledger")
    .select("id, session_id, points, reason, category, created_at")
    .eq("user_email", email.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with session titles in one query
  const sessionIds = [...new Set((entries ?? []).map(e => e.session_id).filter(Boolean))];
  let titleMap: Record<string, string> = {};
  if (sessionIds.length) {
    const { data: sessions } = await db
      .from("sessions")
      .select("id, title, date")
      .in("id", sessionIds);
    titleMap = Object.fromEntries((sessions ?? []).map(s => [s.id, s.title]));
  }

  const enriched = (entries ?? []).map(e => ({
    id:            e.id,
    points:        e.points,
    reason:        e.reason,
    category:      e.category,
    session_title: e.session_id ? (titleMap[e.session_id] ?? null) : null,
    date:          (e.created_at as string).slice(0, 10),
    created_at:    e.created_at,
  }));

  const total = enriched.reduce((s, e) => s + e.points, 0);

  return NextResponse.json({ entries: enriched, total });
}
