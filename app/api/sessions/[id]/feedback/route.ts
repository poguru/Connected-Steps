import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase() ?? null;
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("session_feedback")
    .select("id, user_name, user_email, rating, comment, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  const all = data ?? [];
  const myFeedback = email ? (all.find((f) => f.user_email === email) ?? null) : null;
  // strip emails from public list
  const feedback = all.map(({ user_email: _, ...rest }) => rest);
  return NextResponse.json({ feedback, myFeedback });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { email, rating, comment } = await req.json();
  if (!email || !rating) return NextResponse.json({ error: "email and rating required" }, { status: 400 });
  if (!comment?.trim()) return NextResponse.json({ error: "Please write a review before submitting." }, { status: 400 });
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
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ success: true });
}
