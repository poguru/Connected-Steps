import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notify-inapp";

// GET /api/messages/[id]?limit=50&before=<iso>  → paginated messages, oldest-first
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

    // Read current unread counter then increment — avoids needing a DB function
    const unreadField = sender_type === "user" ? "coach_unread" : "user_unread";
    const { data: conv } = await db
      .from("conversations")
      .select(`id, ${unreadField}`)
      .eq("id", id)
      .single();

    const currentUnread = (conv as Record<string, number> | null)?.[unreadField] ?? 0;

    await db
      .from("conversations")
      .update({
        last_message_at:      new Date().toISOString(),
        last_message_preview: body.trim().slice(0, 80),
        [unreadField]:        currentUnread + 1,
      })
      .eq("id", id);

    // In-app notification + push — non-blocking
    notifyRecipient({ db, conversationId: id, senderEmail: sender_email, senderType: sender_type, body: body.trim() }).catch(() => {});

    return NextResponse.json({ message: msg });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

type ConvRow = { user_email: string; coaches: { name: string } | null };

// Creates an in-app notification and fires push to the recipient.
// notify-inapp handles push internally, so we only need to call createNotification.
async function notifyRecipient({
  db, conversationId, senderEmail, senderType, body,
}: {
  db:             ReturnType<typeof getSupabaseServer>;
  conversationId: string;
  senderEmail:    string;
  senderType:     string;
  body:           string;
}) {
  if (senderType !== "coach") return; // only notify user when coach sends

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
    action_url: "/dashboard/messages",
  });
}
