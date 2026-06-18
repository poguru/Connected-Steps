import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";
import { verifyUserToken } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/posts/[id]/comments
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("user_post_comments")
    .select("id, author_name, author_email, body, created_at")
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

// POST /api/posts/[id]/comments  { author_name, body }
export async function POST(req: NextRequest, { params }: Params) {
  const { id }         = await params;
  const author_email   = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!author_email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { author_name, body } = await req.json().catch(() => ({}));

  if (!author_name || !body?.trim())
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (body.length > 400)
    return NextResponse.json({ error: "Comment must be under 400 characters" }, { status: 400 });

  const blocked = await requireActiveUser(author_email);
  if (blocked) return blocked;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("user_post_comments")
    .insert({ post_id: id, author_email: author_email.toLowerCase(), author_name, body: body.trim() })
    .select("id, author_name, author_email, body, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data }, { status: 201 });
}
