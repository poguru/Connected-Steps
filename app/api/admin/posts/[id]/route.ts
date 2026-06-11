import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { deletePostWithCleanup } from "@/lib/delete-post";

type Params = { params: Promise<{ id: string }> };

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

// DELETE /api/admin/posts/[id]  — admin can delete any post with storage cleanup
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { found } = await deletePostWithCleanup(id, db);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
