import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { deletePostWithCleanup } from "@/lib/delete-post";

type Params = { params: Promise<{ id: string }> };


// DELETE /api/admin/posts/[id]  — admin can delete any post with storage cleanup
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { found } = await deletePostWithCleanup(id, db);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
