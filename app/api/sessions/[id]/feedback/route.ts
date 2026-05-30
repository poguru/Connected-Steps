import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("session_feedback")
    .select("id, user_name, rating, comment, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { email, rating, comment } = await req.json();
  if (!email || !rating) return NextResponse.json({ error: "email and rating required" }, { status: 400 });
  if (rating < 1 || rating > 5) return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 });

  const db = getSupabaseServer();

  // Only allow attended users to submit feedback
  const { data: att } = await db
    .from("session_attendance")
    .select("attended, user_name")
    .eq("session_id", id)
    .eq("user_email", email.toLowerCase())
    .single();
  if (!att?.attended) return NextResponse.json({ error: "You must have attended this session to leave feedback." }, { status: 403 });

  // Upsert — one review per user per session
  const { error } = await db.from("session_feedback").upsert(
    { session_id: id, user_email: email.toLowerCase(), user_name: att.user_name, rating, comment: comment?.trim() ?? "" },
    { onConflict: "session_id,user_email" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
