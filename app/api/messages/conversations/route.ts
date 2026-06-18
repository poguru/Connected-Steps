import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, verifyCoachToken } from "@/lib/admin-auth";

// GET  /api/messages/conversations?email=...       → user's conversations (requires x-user-token)
// GET  /api/messages/conversations?coach_email=... → coach's inbox (requires x-coach-token)
export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseServer();
    const { searchParams } = new URL(req.url);
    const coachEmail = searchParams.get("coach_email");

    if (coachEmail) {
      // Coach inbox: authenticate via coach token
      const coachToken = req.headers.get("x-coach-token");
      if (!coachToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const tokenEmail = verifyCoachToken(coachToken);
      if (!tokenEmail || tokenEmail.toLowerCase() !== coachEmail.toLowerCase()) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

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

    // User inbox: authenticate via user token
    const userToken = req.headers.get("x-user-token");
    if (!userToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userEmail = verifyUserToken(userToken);
    if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await db
      .from("conversations")
      .select("id, user_email, last_message_at, last_message_preview, user_unread, coaches(id, name, specialization, avatar_url)")
      .eq("user_email", userEmail.toLowerCase())
      .order("last_message_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversations: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/messages/conversations — create or return existing conversation
export async function POST(req: NextRequest) {
  const userToken = req.headers.get("x-user-token");
  if (!userToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(userToken);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { coach_id } = await req.json();
    if (!coach_id) return NextResponse.json({ error: "coach_id required" }, { status: 400 });

    const db = getSupabaseServer();
    const { data, error } = await db
      .from("conversations")
      .upsert({ user_email: userEmail.toLowerCase(), coach_id }, { onConflict: "user_email,coach_id" })
      .select("id, user_email, coach_id, last_message_at, last_message_preview, user_unread")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversation: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
