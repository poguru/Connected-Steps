import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";

// GET /api/community/likes?email=...
// Returns like counts for all posts + which ones this user has liked
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") ?? "";
  const db    = getSupabaseServer();

  const { data: all } = await db
    .from("post_likes")
    .select("post_id, user_email");

  if (!all) return NextResponse.json({ likeCounts: {}, likedByMe: [] });

  const likeCounts: Record<number, number> = {};
  const likedByMe: number[] = [];

  for (const row of all) {
    likeCounts[row.post_id] = (likeCounts[row.post_id] ?? 0) + 1;
    if (email && row.user_email === email.toLowerCase().trim()) likedByMe.push(row.post_id);
  }

  return NextResponse.json({ likeCounts, likedByMe });
}

// POST /api/community/likes  { post_id, email }
// Toggles like — inserts if not liked, deletes if already liked
export async function POST(req: NextRequest) {
  const { post_id, email } = await req.json();
  if (!post_id || !email) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const blocked = await requireActiveUser(email);
  if (blocked) return blocked;

  const db  = getSupabaseServer();
  const lc  = email.toLowerCase().trim();

  const { data: existing } = await db
    .from("post_likes")
    .select("id")
    .eq("post_id", post_id)
    .eq("user_email", lc)
    .maybeSingle();

  if (existing) {
    await db.from("post_likes").delete().eq("id", existing.id);
  } else {
    await db.from("post_likes").insert({ post_id, user_email: lc });
  }

  const { count } = await db
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", post_id);

  return NextResponse.json({ liked: !existing, count: count ?? 0 });
}
