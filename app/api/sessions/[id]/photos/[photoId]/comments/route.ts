import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

// GET /api/sessions/[id]/photos/[photoId]/comments
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { photoId } = await params;
    const db = getSupabaseServer();

    const { data, error } = await db
      .from("photo_comments")
      .select("id, commenter_email, commenter_name, comment, created_at")
      .eq("photo_id", photoId)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ comments: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/sessions/[id]/photos/[photoId]/comments
// Body: { commenter_email, commenter_name, comment }
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { photoId } = await params;
    const { commenter_email, commenter_name, comment } = await req.json();

    if (!commenter_email || !comment?.trim()) {
      return NextResponse.json({ error: "commenter_email and comment required" }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { data, error } = await db
      .from("photo_comments")
      .insert({
        photo_id:        photoId,
        commenter_email,
        commenter_name:  commenter_name ?? commenter_email.split("@")[0],
        comment:         comment.trim(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ comment: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/sessions/[id]/photos/[photoId]/comments?comment_id=&email=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    await params;
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("comment_id");
    const email     = searchParams.get("email");

    if (!commentId || !email) {
      return NextResponse.json({ error: "comment_id and email required" }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { data: existing } = await db
      .from("photo_comments")
      .select("commenter_email")
      .eq("id", commentId)
      .single();

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.commenter_email !== email) {
      return NextResponse.json({ error: "Can only delete your own comments" }, { status: 403 });
    }

    await db.from("photo_comments").delete().eq("id", commentId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
