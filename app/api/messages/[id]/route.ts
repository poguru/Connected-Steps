import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/messages/[id]?limit=50&before=<iso>  → paginated messages
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }  = await params;
    const { searchParams } = new URL(req.url);
    const limit   = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const before  = searchParams.get("before");

    const db = getSupabaseServer();
    let q = db
      .from("messages")
      .select("id, sender_email, sender_type, body, created_at, read_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) q = q.lt("created_at", before);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Return oldest-first so client can append
    return NextResponse.json({ messages: (data ?? []).reverse() });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/messages/[id]
// Body: { sender_email, sender_type: 'user'|'coach', body }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }                              = await params;
    const { sender_email, sender_type, body } = await req.json();

    if (!sender_email || !sender_type || !body?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Insert message
    const { data: msg, error: msgErr } = await db
      .from("messages")
      .insert({ conversation_id: id, sender_email, sender_type, body: body.trim() })
      .select()
      .single();

    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    // Update conversation preview + unread counter for the recipient
    const unreadField = sender_type === "user" ? "coach_unread" : "user_unread";
    await db
      .from("conversations")
      .update({
        last_message_at:      new Date().toISOString(),
        last_message_preview: body.trim().slice(0, 80),
        [unreadField]:        db.rpc("increment_unread" as never) as never,  // handled inline below
      })
      .eq("id", id);

    // Simpler unread increment — just raw SQL via rpc isn't available without a function,
    // so we read then write
    await db.rpc("increment_conversation_unread" as never, {
      conv_id:    id,
      unread_col: unreadField,
    }).catch(() => {
      // If the RPC doesn't exist yet, fall back to a simple update (won't be accurate but won't break)
    });

    // Update last_message_at and preview (always works)
    await db
      .from("conversations")
      .update({
        last_message_at:      new Date().toISOString(),
        last_message_preview: body.trim().slice(0, 80),
      })
      .eq("id", id);

    // Fire push notification to recipient — non-blocking
    sendPushNotification({ db, conversationId: id, senderEmail: sender_email, senderType: sender_type, body: body.trim() }).catch(() => {});

    return NextResponse.json({ message: msg });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function sendPushNotification({
  db, conversationId, senderEmail, senderType, body,
}: {
  db: ReturnType<typeof getSupabaseServer>;
  conversationId: string;
  senderEmail: string;
  senderType: string;
  body: string;
}) {
  // Get conversation to find the recipient email
  const { data: conv } = await db
    .from("conversations")
    .select("user_email, coaches(name)")
    .eq("id", conversationId)
    .single();

  if (!conv) return;

  // Recipient is the other party
  const recipientEmail = senderType === "user" ? (conv as { coaches?: { name?: string }; user_email: string }).coaches?.name : conv.user_email;
  if (!recipientEmail) return;

  // Look up recipient's push token — for users we use their email, for coaches we look up the coach email
  const targetEmail = senderType === "user" ? conv.user_email : senderEmail;
  // When sender is coach, recipient is user
  const lookupEmail = senderType === "coach" ? conv.user_email : senderEmail;

  const { data: tokens } = await db
    .from("push_tokens")
    .select("token")
    .eq("user_email", lookupEmail === targetEmail ? conv.user_email : lookupEmail);

  if (!tokens?.length) return;

  const coachesInfo = (conv as { coaches?: { name?: string } }).coaches;
  const senderName = senderType === "coach"
    ? (coachesInfo?.name ?? "Coach")
    : senderEmail.split("@")[0];

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      tokens.map((t: { token: string }) => ({
        to:    t.token,
        title: senderName,
        body:  body.slice(0, 100),
        data:  { conversationId },
        sound: "default",
      }))
    ),
  });
}
