import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { cacheGet, cacheSet, CK, TTL } from "@/lib/cache";

type JoinedSessionsPayload = {
  session_ids:  string[];
  attended_ids: string[];
};

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = verifyUserToken(token);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key      = email.toLowerCase();
  const cacheKey = CK.userJoinedSessions(key);

  // ── Cache read ──────────────────────────────────────────────────────────────
  const cached = await cacheGet<JoinedSessionsPayload>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("session_attendance")
    .select("session_id, attended")
    .eq("user_email", key);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const body: JoinedSessionsPayload = {
    session_ids:  rows.map((r) => r.session_id),
    attended_ids: rows.filter((r) => r.attended).map((r) => r.session_id),
  };

  void cacheSet(cacheKey, body, TTL.userJoinedSessions);

  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}
