import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string; commentId: string }> };

// DELETE /api/posts/[id]/comments/[commentId]
export async function DELETE(req: NextRequest, { params }: Params) {
  const { commentId } = await params;
  const email         = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: comment } = await db
    .from("user_post_comments").select("id, author_email").eq("id", commentId).single();

  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (comment.author_email.toLowerCase() !== email.toLowerCase())
    return NextResponse.json({ error: "Not your comment" }, { status: 403 });

  await db.from("user_post_comments").delete().eq("id", commentId);
  return NextResponse.json({ success: true });
}
