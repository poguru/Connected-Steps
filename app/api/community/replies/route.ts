import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";

export async function GET(req: NextRequest) {
  const post_id = req.nextUrl.searchParams.get("post_id");
  if (!post_id) return NextResponse.json({ error: "Missing post_id" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("community_replies")
    .select("id, user_name, body, created_at")
    .eq("post_id", Number(post_id))
    .eq("approved", true)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ replies: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const { post_id, user_email, user_name, body } = await req.json();
    if (!post_id || !user_email || !user_name || !body?.trim())
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (body.trim().length > 600)
      return NextResponse.json({ error: "Reply must be under 600 characters" }, { status: 400 });

    const blocked = await requireActiveUser(user_email);
    if (blocked) return blocked;

    const db = getSupabaseServer();
    const { error } = await db.from("community_replies").insert({
      post_id: Number(post_id),
      user_email,
      user_name,
      body: body.trim(),
      approved: true,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
