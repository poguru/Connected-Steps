import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { requireActiveUser } from "@/lib/active-user";
import { deletePostWithCleanup } from "@/lib/delete-post";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/posts/[id]  — only the author can delete
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const email  = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocked = await requireActiveUser(email);
  if (blocked) return blocked;

  const db = getSupabaseServer();

  const { data: post } = await db
    .from("user_posts").select("id, author_email").eq("id", id).single();

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.author_email.toLowerCase() !== email.toLowerCase())
    return NextResponse.json({ error: "Not your post" }, { status: 403 });

  await deletePostWithCleanup(id, db);
  return NextResponse.json({ success: true });
}
