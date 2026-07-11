import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

// DELETE /api/sessions/[id]/photos/[photoId]?email=uploader
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { photoId }      = await params;
    const email            = new URL(req.url).searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const db = getSupabaseServer();

    const { data: photo } = await db
      .from("session_photos")
      .select("photo_url, uploader_email")
      .eq("id", photoId)
      .single();

    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (photo.uploader_email !== email) {
      return NextResponse.json({ error: "Can only delete your own photos" }, { status: 403 });
    }

    // Remove from Storage
    const key = photo.photo_url.split("/session-photos/")[1];
    if (key) await db.storage.from("session-photos").remove([key]);

    await db.from("session_photos").delete().eq("id", photoId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/sessions/[id]/photos/[photoId]?action=like
// Body: { user_email }
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { photoId } = await params;
    const action      = new URL(req.url).searchParams.get("action");
    if (action !== "like") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    const { user_email } = await req.json();
    if (!user_email) return NextResponse.json({ error: "user_email required" }, { status: 400 });

    const db = getSupabaseServer();

    const { data: existing } = await db
      .from("photo_likes")
      .select("id")
      .eq("photo_id", photoId)
      .eq("user_email", user_email)
      .single();

    if (existing) {
      await db.from("photo_likes").delete().eq("id", existing.id);
      return NextResponse.json({ action: "unliked" });
    } else {
      await db.from("photo_likes").insert({ photo_id: photoId, user_email });
      return NextResponse.json({ action: "liked" });
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
