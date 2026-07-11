import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// PATCH /api/messages/[id]/read
// Body: { reader_type: 'user' | 'coach' }
// Marks all unread messages in the conversation as read and resets the unread counter
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }          = await params;
    const { reader_type } = await req.json();

    if (reader_type !== "user" && reader_type !== "coach") {
      return NextResponse.json({ error: "reader_type must be 'user' or 'coach'" }, { status: 400 });
    }

    const db          = getSupabaseServer();
    const now         = new Date().toISOString();
    const senderType  = reader_type === "user" ? "coach" : "user"; // messages sent BY the other party

    // Mark messages as read
    await db
      .from("messages")
      .update({ read_at: now })
      .eq("conversation_id", id)
      .eq("sender_type", senderType)
      .is("read_at", null);

    // Reset unread counter for this reader
    const unreadField = reader_type === "user" ? "user_unread" : "coach_unread";
    await db
      .from("conversations")
      .update({ [unreadField]: 0 })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
