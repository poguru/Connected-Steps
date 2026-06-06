import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET  /api/messages/conversations?email=user@x.com          → user's conversations
// GET  /api/messages/conversations?coach_email=coach@x.com   → coach's inbox
export async function GET(req: NextRequest) {
  try {
    const db          = getSupabaseServer();
    const { searchParams } = new URL(req.url);
    const email       = searchParams.get("email");
    const coachEmail  = searchParams.get("coach_email");

    if (coachEmail) {
      // Coach inbox: find coach, then fetch their conversations
      const { data: coach } = await db
        .from("coaches")
        .select("id")
        .eq("email", coachEmail)
        .single();

      if (!coach) return NextResponse.json({ conversations: [] });

      const { data, error } = await db
        .from("conversations")
        .select("id, user_email, last_message_at, last_message_preview, coach_unread, coaches(id, name, specialization)")
        .eq("coach_id", coach.id)
        .order("last_message_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ conversations: data ?? [] });
    }

    if (email) {
      const { data, error } = await db
        .from("conversations")
        .select("id, user_email, last_message_at, last_message_preview, user_unread, coaches(id, name, specialization, avatar_url)")
        .eq("user_email", email)
        .order("last_message_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ conversations: data ?? [] });
    }

    return NextResponse.json({ error: "email or coach_email required" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/messages/conversations
// Body: { user_email, coach_id }  → creates or returns existing conversation
export async function POST(req: NextRequest) {
  try {
    const { user_email, coach_id } = await req.json();
    if (!user_email || !coach_id) {
      return NextResponse.json({ error: "user_email and coach_id required" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Upsert so we never create duplicate (user, coach) pairs
    const { data, error } = await db
      .from("conversations")
      .upsert({ user_email, coach_id }, { onConflict: "user_email,coach_id" })
      .select("id, user_email, coach_id, last_message_at, last_message_preview, user_unread")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversation: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
