import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { hashDraftToken, isWellFormedDraftToken } from "@/lib/it-run-drafts";

// POST /api/it-run/drafts/discard
// Body: { token } (or a signed-in session, which discards that account's latest open draft).
// Used by "Start New Registration". Converted drafts are never changed. Idempotent.
export async function POST(req: NextRequest) {
  let body: { token?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found.", code: "EVENT_NOT_FOUND" }, { status: 404 });

  if (isWellFormedDraftToken(body.token)) {
    await db
      .from("it_run_drafts")
      .update({ status: "discarded" })
      .eq("token_hash", hashDraftToken(body.token))
      .eq("event_id", event.id)
      .eq("status", "open");
    return NextResponse.json({ ok: true });
  }

  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) return NextResponse.json({ error: "Nothing to discard.", code: "INVALID_REQUEST" }, { status: 400 });

  const { data: latest } = await db
    .from("it_run_drafts")
    .select("id")
    .eq("event_id", event.id)
    .eq("owner_email", email.toLowerCase())
    .eq("status", "open")
    .order("saved_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (latest) {
    await db.from("it_run_drafts").update({ status: "discarded" }).eq("id", latest.id).eq("status", "open");
  }
  return NextResponse.json({ ok: true });
}
