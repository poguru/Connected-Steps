import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string; mediaId: string }> };

// ── PATCH /api/sessions/[id]/media/[mediaId] ─────────────────────────────────
// Update a media item: set as cover, update caption, change display_order.
// Body (JSON): { is_cover?, caption?, display_order? }
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, mediaId } = await params;
  const db = getSupabaseServer();
  const body = await req.json().catch(() => ({})) as {
    is_cover?: boolean;
    caption?: string | null;
    display_order?: number;
  };

  // When setting this item as the cover, clear any existing cover first
  if (body.is_cover === true) {
    await db
      .from("session_media")
      .update({ is_cover: false })
      .eq("session_id", id)
      .eq("is_cover", true)
      .neq("id", mediaId);
  }

  const updates: Record<string, unknown> = {};
  if (body.is_cover       !== undefined) updates.is_cover       = body.is_cover;
  if (body.caption        !== undefined) updates.caption        = body.caption;
  if (body.display_order  !== undefined) updates.display_order  = body.display_order;

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("session_media")
    .update(updates)
    .eq("id", mediaId)
    .eq("session_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // When marking this item as the cover, sync sessions.photo_url and bust the
  // homepage cache so the Community Highlights module reflects the change immediately.
  if (body.is_cover === true && data) {
    const photoUrl = (data as { thumbnail_url?: string | null; url?: string }).thumbnail_url
      ?? (data as { url?: string }).url;
    if (photoUrl) {
      await db.from("sessions").update({ photo_url: photoUrl }).eq("id", id);
    }
    revalidatePath("/");
  }

  return NextResponse.json({ media: data });
}

// ── DELETE /api/sessions/[id]/media/[mediaId] ────────────────────────────────
// Delete a media item. Also removes the file from Supabase Storage.
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, mediaId } = await params;
  const db = getSupabaseServer();

  // Fetch the item first to get storage path
  const { data: item, error: fetchErr } = await db
    .from("session_media")
    .select("url, media_type")
    .eq("id", mediaId)
    .eq("session_id", id)
    .single();

  if (fetchErr || !item) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  // Delete from storage
  const bucket = item.media_type === "video" ? "session-videos" : "session-photos";
  const urlObj = new URL(item.url);
  const pathParts = urlObj.pathname.split("/object/public/");
  if (pathParts[1]) {
    const filePath = pathParts[1].replace(`${bucket}/`, "");
    await db.storage.from(bucket).remove([filePath]);
  }

  // Delete from DB
  const { error } = await db
    .from("session_media")
    .delete()
    .eq("id", mediaId)
    .eq("session_id", id);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
