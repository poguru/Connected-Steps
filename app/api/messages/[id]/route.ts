import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notify-inapp";
import { verifyUserToken, verifyCoachToken, COOKIE_NAME } from "@/lib/admin-auth";

// ── Auth helper ───────────────────────────────────────────────────────────────

type Caller = { email: string; type: "user" | "coach" };

async function resolveCaller(req: NextRequest): Promise<Caller | null> {
  const userToken = req.headers.get("x-user-token");
  if (userToken) {
    const email = verifyUserToken(userToken);
    if (email) return { email: email.toLowerCase(), type: "user" };
  }
  const coachToken =
    req.headers.get("x-coach-token") ?? req.cookies.get(COOKIE_NAME)?.value;
  if (coachToken) {
    const email = verifyCoachToken(coachToken);
    if (email) return { email: email.toLowerCase(), type: "coach" };
  }
  return null;
}

// Verify that the caller owns one side of the conversation.
// Returns the conversation row or null if access is denied.
async function getConvIfAuthorized(
  db: ReturnType<typeof getSupabaseServer>,
  conversationId: string,
  caller: Caller,
) {
  const { data: conv } = await db
    .from("conversations")
    .select("id, user_email, coach_id, coaches(email)")
    .eq("id", conversationId)
    .single<{
      id: string;
      user_email: string;
      coach_id: string;
      coaches: { email: string } | null;
    }>();

  if (!conv) return null;

  if (caller.type === "user") {
    return conv.user_email.toLowerCase() === caller.email ? conv : null;
  } else {
    // Coach: match by the coach email stored in the coaches table
    const coachEmail = conv.coaches?.email?.toLowerCase() ?? "";
    return coachEmail === caller.email ? conv : null;
  }
}

// ── GET /api/messages/[id] — paginated messages ───────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const db     = getSupabaseServer();
  const caller = await resolveCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conv = await getConvIfAuthorized(db, id, caller);
  if (!conv) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const limit  = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const before = searchParams.get("before");

    let q = db
      .from("messages")
      .select("id, sender_email, sender_type, body, created_at, read_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) q = q.lt("created_at", before);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ messages: (data ?? []).reverse() });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── POST /api/messages/[id] — send a message ─────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const db     = getSupabaseServer();
  const caller = await resolveCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conv = await getConvIfAuthorized(db, id, caller);
  if (!conv) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { body } = await req.json();
    if (!body?.trim()) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    // Derive sender identity from the verified token — never trust the request body
    const sender_email = caller.email;
    const sender_type  = caller.type;

    const { data: msg, error: msgErr } = await db
      .from("messages")
      .insert({ conversation_id: id, sender_email, sender_type, body: body.trim() })
      .select()
      .single();

    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    const unreadField    = sender_type === "user" ? "coach_unread" : "user_unread";
    const { data: conv2 } = await db
      .from("conversations")
      .select(`id, ${unreadField}`)
      .eq("id", id)
      .single();

    const currentUnread = (conv2 as Record<string, number> | null)?.[unreadField] ?? 0;

    await db.from("conversations").update({
      last_message_at:      new Date().toISOString(),
      last_message_preview: body.trim().slice(0, 80),
      [unreadField]:        currentUnread + 1,
    }).eq("id", id);

    notifyRecipient({ db, conversationId: id, senderEmail: sender_email, senderType: sender_type, body: body.trim() })
      .catch(() => {});

    return NextResponse.json({ message: msg });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── Notification helper ───────────────────────────────────────────────────────

type ConvRow = { user_email: string; coaches: { name: string } | null };

async function notifyRecipient({
  db, conversationId, senderEmail, senderType, body,
}: {
  db:             ReturnType<typeof getSupabaseServer>;
  conversationId: string;
  senderEmail:    string;
  senderType:     string;
  body:           string;
}) {
  if (senderType !== "coach") return;

  const { data: conv } = await db
    .from("conversations")
    .select("user_email, coaches(name)")
    .eq("id", conversationId)
    .single<ConvRow>();

  if (!conv) return;

  const coachName = conv.coaches?.name ?? "Your coach";

  await createNotification({
    user_email: conv.user_email,
    type:       "coach_message",
    title:      `${coachName} sent you a message`,
    body:       body.slice(0, 120),
    action_url: "/messages",
  });
}
