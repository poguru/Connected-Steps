import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET — approved posts (public)
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("community_posts")
    .select("id, user_name, category, title, body, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

// POST — submit a question/post
export async function POST(req: NextRequest) {
  try {
    const { user_email, user_name, category, title, body } = await req.json();
    if (!user_email || !user_name || !category || !title?.trim() || !body?.trim())
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (title.length > 120)
      return NextResponse.json({ error: "Title must be under 120 characters" }, { status: 400 });
    if (body.length > 600)
      return NextResponse.json({ error: "Post must be under 600 characters" }, { status: 400 });

    const db = getSupabaseServer();
    await db.from("community_posts").insert({
      user_email, user_name,
      category, title: title.trim(), body: body.trim(),
      approved: true,
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
