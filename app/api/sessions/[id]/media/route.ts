import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/sessions/[id]/media ─────────────────────────────────────────────
// Returns all media items for a session, ordered by display_order.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("session_media")
    .select("id, media_type, url, thumbnail_url, caption, duration_secs, file_size, width, height, display_order, is_cover, uploader_email, created_at")
    .eq("session_id", id)
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ media: data ?? [] });
}

// ── POST /api/sessions/[id]/media ────────────────────────────────────────────
// Upload a photo or video for a session.
// Body: multipart/form-data
//   file            File      — the media file (image/* or video/*)
//   uploader_email  string
//   uploader_name?  string
//   caption?        string
//   set_as_cover?   "true" | "false"
//   thumbnail_url?  string    — pre-generated thumbnail (optional)
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const form = await req.formData();

  const file          = form.get("file")           as File | null;
  const uploaderEmail = form.get("uploader_email") as string | null;
  const uploaderName  = form.get("uploader_name")  as string | null;
  const caption       = form.get("caption")        as string | null;
  const setAsCover    = form.get("set_as_cover") === "true";
  const thumbnailUrl  = form.get("thumbnail_url")  as string | null;

  if (!file || !uploaderEmail) {
    return NextResponse.json({ error: "file and uploader_email required" }, { status: 400 });
  }

  // Validate file size (100 MB max)
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 100 MB" }, { status: 413 });
  }

  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");

  if (!isVideo && !isImage) {
    return NextResponse.json({ error: "Only image or video files are accepted" }, { status: 415 });
  }

  // Validate video format
  if (isVideo && !["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) {
    return NextResponse.json({ error: "Supported video formats: MP4, MOV, WEBM" }, { status: 415 });
  }

  const db  = getSupabaseServer();
  const ext = file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
  const bucket = isVideo ? "session-videos" : "session-photos";
  const key  = `${id}/${Date.now()}_${uploaderEmail.replace("@", "_")}.${ext}`;
  const buf  = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage
    .from(bucket)
    .upload(key, buf, { contentType: file.type, upsert: false });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: urlData } = db.storage.from(bucket).getPublicUrl(key);
  const publicUrl = urlData.publicUrl;

  // When setting as cover, clear the existing cover first
  if (setAsCover) {
    await db
      .from("session_media")
      .update({ is_cover: false })
      .eq("session_id", id)
      .eq("is_cover", true);
  }

  // Determine display order (append at end)
  const { count } = await db
    .from("session_media")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);

  const { data: inserted, error: dbErr } = await db
    .from("session_media")
    .insert({
      session_id:     id,
      media_type:     isVideo ? "video" : "image",
      url:            publicUrl,
      thumbnail_url:  thumbnailUrl ?? (isImage ? publicUrl : null),
      caption:        caption?.trim() || null,
      file_size:      file.size,
      display_order:  count ?? 0,
      is_cover:       setAsCover,
      uploader_email: uploaderEmail,
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ media: inserted }, { status: 201 });
}
