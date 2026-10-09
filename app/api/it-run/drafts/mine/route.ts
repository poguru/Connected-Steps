import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { newDraftToken, hashDraftToken } from "@/lib/it-run-drafts";

// GET /api/it-run/drafts/mine
// A signed-in participant's latest open draft, for resuming on a new device or after clearing storage.
// Issues a fresh token and retires the old one, so only the most recent device holds a working token.
export async function GET(req: NextRequest) {
  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) return NextResponse.json({ error: "Please sign in.", code: "AUTH_REQUIRED" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found.", code: "EVENT_NOT_FOUND" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: row, error } = await db
    .from("it_run_drafts")
    .select("id, version, state, saved_at, expires_at")
    .eq("event_id", event.id)
    .eq("owner_email", email.toLowerCase())
    .eq("status", "open")
    .gt("expires_at", nowIso)
    .order("saved_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; version: number; state: Record<string, unknown>; saved_at: string; expires_at: string }>();

  if (error) return NextResponse.json({ error: "We couldn't load your draft right now. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
  if (!row) return NextResponse.json({ draft: null }, { headers: { "Cache-Control": "private, no-store" } });

  const token = newDraftToken();
  const { data: rotated, error: rotErr } = await db
    .from("it_run_drafts")
    .update({ token_hash: hashDraftToken(token) })
    .eq("id", row.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (rotErr || !rotated) {
    return NextResponse.json({ error: "We couldn't load your draft right now. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
  }

  return NextResponse.json({
    token,
    draft: row.state,
    version: row.version,
    savedAt: row.saved_at,
    expiresAt: row.expires_at,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
