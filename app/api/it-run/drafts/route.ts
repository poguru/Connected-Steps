import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";
import {
  DRAFT_TTL_MS,
  newDraftToken,
  hashDraftToken,
  isWellFormedDraftToken,
  validateDraftState,
} from "@/lib/it-run-drafts";

// Registration drafts: save and resume.
//
// POST /api/it-run/drafts
//   { draft, token?, expectedVersion? }
//   No token: creates a draft and returns its token (shown once; only the hash is stored).
//   With token: saves over the draft only if expectedVersion matches the stored version.
//   Returns 200 { token?, version, savedAt, expiresAt }. "Saved" means this response, nothing else.
//
// GET /api/it-run/drafts?t=<token>
//   Resume a draft by its token. Returns the saved state and version.
//
// A draft never creates a registration, reserves capacity, applies a coupon, or creates a payment.

type DraftRow = {
  id: string;
  status: "open" | "converted" | "discarded";
  version: number;
  state: Record<string, unknown>;
  saved_at: string;
  expires_at: string;
  owner_email: string | null;
};

async function eventIdFor(db: ReturnType<typeof getSupabaseServer>): Promise<string | null> {
  const { data } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

function sessionEmailFrom(req: NextRequest): string | null {
  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  return email ? email.toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  const rl = await checkAndRecordEndpointLimit(`itr:draft:${getClientIp(req)}`, 120, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many saves. Please wait a moment.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { draft?: unknown; token?: unknown; expectedVersion?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request.", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const validation = validateDraftState(body.draft);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message, code: "INVALID_DRAFT" }, { status: 400 });
  }
  const { state } = validation;

  const db = getSupabaseServer();
  const eventId = await eventIdFor(db);
  if (!eventId) return NextResponse.json({ error: "Event not found.", code: "EVENT_NOT_FOUND" }, { status: 404 });

  // The category must exist for this event. Availability and price are rechecked on resume and at payment.
  const { data: category } = await db
    .from("it_run_categories")
    .select("id")
    .eq("id", state.selectedCatId)
    .eq("event_id", eventId)
    .maybeSingle<{ id: string }>();
  if (!category) {
    return NextResponse.json({ error: "That category is not available for this event.", code: "CATEGORY_UNAVAILABLE" }, { status: 400 });
  }

  const now = Date.now();
  const savedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + DRAFT_TTL_MS).toISOString();
  const sessionEmail = sessionEmailFrom(req);

  // Create
  if (body.token === undefined || body.token === null || body.token === "") {
    const token = newDraftToken();
    const { data: created, error } = await db
      .from("it_run_drafts")
      .insert({
        event_id: eventId,
        token_hash: hashDraftToken(token),
        owner_email: sessionEmail,
        status: "open",
        version: 1,
        state,
        saved_at: savedAt,
        expires_at: expiresAt,
      })
      .select("version")
      .maybeSingle<{ version: number }>();
    if (error || !created) {
      console.error("[it-run/drafts] create failed:", error?.code ?? "no row");
      return NextResponse.json({ error: "We couldn't save your progress. Please try again.", code: "SAVE_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ token, version: 1, savedAt, expiresAt });
  }

  // Update
  if (!isWellFormedDraftToken(body.token)) {
    return NextResponse.json({ error: "This draft link is not valid.", code: "INVALID_TOKEN" }, { status: 400 });
  }
  if (!Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "Save version is missing.", code: "VERSION_REQUIRED" }, { status: 400 });
  }
  const expectedVersion = body.expectedVersion as number;

  const { data: row, error: rowErr } = await db
    .from("it_run_drafts")
    .select("id, status, version, state, saved_at, expires_at, owner_email")
    .eq("token_hash", hashDraftToken(body.token))
    .eq("event_id", eventId)
    .maybeSingle<DraftRow>();
  if (rowErr) return NextResponse.json({ error: "We couldn't save your progress. Please try again.", code: "SAVE_FAILED" }, { status: 500 });
  if (!row || row.status === "discarded") {
    return NextResponse.json({ error: "We couldn't find this draft. Start a new registration.", code: "DRAFT_NOT_FOUND" }, { status: 404 });
  }
  if (row.status === "converted") {
    return NextResponse.json({ error: "This registration was already submitted. Your draft can no longer be changed.", code: "DRAFT_CONVERTED" }, { status: 409 });
  }
  if (new Date(row.expires_at).getTime() <= now) {
    return NextResponse.json({ error: "This draft has expired. Start a new registration.", code: "DRAFT_EXPIRED" }, { status: 410 });
  }
  // A draft belongs to the category it was started for. Saving another category into it would mix two registrations.
  const savedCategory = (row.state as { selectedCatId?: unknown }).selectedCatId;
  if (typeof savedCategory === "string" && savedCategory !== state.selectedCatId) {
    return NextResponse.json({
      error: "This saved registration is for a different category. Start a new registration to choose this category.",
      code: "DRAFT_CATEGORY_MISMATCH",
    }, { status: 409 });
  }
  if (row.version !== expectedVersion) {
    // Another tab or device saved a newer version. Never overwrite it.
    return NextResponse.json({
      error: "This registration was updated in another tab or device. Reload to continue from the latest save.",
      code: "VERSION_CONFLICT",
      currentVersion: row.version,
      savedAt: row.saved_at,
    }, { status: 409 });
  }

  // Compare-and-swap: only the version we checked can be replaced
  const { data: updated, error: updErr } = await db
    .from("it_run_drafts")
    .update({
      state,
      version: expectedVersion + 1,
      saved_at: savedAt,
      expires_at: expiresAt,
      owner_email: row.owner_email ?? sessionEmail,
    })
    .eq("id", row.id)
    .eq("version", expectedVersion)
    .eq("status", "open")
    .select("version")
    .maybeSingle<{ version: number }>();

  if (updErr) {
    console.error("[it-run/drafts] update failed:", updErr.code ?? "unknown");
    return NextResponse.json({ error: "We couldn't save your progress. Please try again.", code: "SAVE_FAILED" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({
      error: "This registration was updated in another tab or device. Reload to continue from the latest save.",
      code: "VERSION_CONFLICT",
    }, { status: 409 });
  }

  return NextResponse.json({ version: updated.version, savedAt, expiresAt });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!isWellFormedDraftToken(token)) {
    return NextResponse.json({ error: "This draft link is not valid.", code: "INVALID_TOKEN" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const eventId = await eventIdFor(db);
  if (!eventId) return NextResponse.json({ error: "Event not found.", code: "EVENT_NOT_FOUND" }, { status: 404 });

  const { data: row, error } = await db
    .from("it_run_drafts")
    .select("id, status, version, state, saved_at, expires_at, owner_email")
    .eq("token_hash", hashDraftToken(token))
    .eq("event_id", eventId)
    .maybeSingle<DraftRow>();
  if (error) return NextResponse.json({ error: "We couldn't load your draft right now. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
  if (!row || row.status === "discarded") {
    return NextResponse.json({ error: "We couldn't find this draft. Start a new registration.", code: "DRAFT_NOT_FOUND" }, { status: 404 });
  }
  if (row.status === "converted") {
    return NextResponse.json({ error: "This registration was already submitted.", code: "DRAFT_CONVERTED" }, { status: 409 });
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This draft has expired. Start a new registration.", code: "DRAFT_EXPIRED" }, { status: 410 });
  }

  return NextResponse.json({
    draft: row.state,
    version: row.version,
    savedAt: row.saved_at,
    expiresAt: row.expires_at,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
