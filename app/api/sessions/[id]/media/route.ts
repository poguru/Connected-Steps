import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

  if (error) {
    console.error("[media/GET] session_media select failed", { message: error.message, code: error.code });
    return NextResponse.json({ error: `DB error (${error.code ?? "?"}): ${error.message}` }, { status: 500 });
  }
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
  const caption       = form.get("caption")        as string | null;
  const clientWantsCover = form.get("set_as_cover") === "true";
  const thumbnailUrl  = form.get("thumbnail_url")  as string | null;

  if (!file || !uploaderEmail) {
    return NextResponse.json({ error: "file and uploader_email required" }, { status: 400 });
  }

  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 100 MB" }, { status: 413 });
  }

  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");

  if (!isVideo && !isImage) {
    return NextResponse.json({ error: "Only image or video files are accepted" }, { status: 415 });
  }

  if (isVideo && !["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) {
    return NextResponse.json({ error: "Supported video formats: MP4, MOV, WEBM" }, { status: 415 });
  }

  const db     = getSupabaseServer();
  const ext    = file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
  const bucket = isVideo ? "session-videos" : "session-photos";
  const key    = `${id}/${Date.now()}_${uploaderEmail.replace("@", "_")}.${ext}`;
  const buf    = Buffer.from(await file.arrayBuffer());

  // ── 1. Upload file to storage ─────────────────────────────────────────────
  const { error: upErr } = await db.storage
    .from(bucket)
    .upload(key, buf, { contentType: file.type, upsert: false });

  if (upErr) {
    console.error("[media/POST] storage upload failed", {
      bucket, key, message: upErr.message,
    });
    return NextResponse.json(
      { error: `Storage error: ${upErr.message}` },
      { status: 500 },
    );
  }

  const { data: urlData } = db.storage.from(bucket).getPublicUrl(key);
  const publicUrl = urlData.publicUrl;

  // ── 2. Server-side cover decision ────────────────────────────────────────
  // Never trust client-side state for the cover flag — always query the DB so
  // we can't race against a stale items[] and violate the unique cover index.
  const { count: existingCount, error: countErr } = await db
    .from("session_media")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);

  if (countErr) {
    console.error("[media/POST] session_media count failed", {
      message: countErr.message, code: countErr.code,
    });
    return NextResponse.json(
      { error: `DB error (${countErr.code ?? "?"}): ${countErr.message}` },
      { status: 500 },
    );
  }

  const totalExisting = existingCount ?? 0;
  // Become cover if: client asked for it, OR this is the very first file ever.
  // Never set cover when other rows already exist — that belongs to the star button.
  const setAsCover = totalExisting === 0 || clientWantsCover;

  // ── 3. Clear any existing cover (idempotent) ──────────────────────────────
  if (setAsCover) {
    const { error: clearErr } = await db
      .from("session_media")
      .update({ is_cover: false })
      .eq("session_id", id)
      .eq("is_cover", true);

    if (clearErr) {
      console.error("[media/POST] cover clear failed", {
        message: clearErr.message, code: clearErr.code,
      });
      return NextResponse.json(
        { error: `DB error clearing cover (${clearErr.code ?? "?"}): ${clearErr.message}` },
        { status: 500 },
      );
    }
  }

  // ── 4. Insert the new media row ───────────────────────────────────────────
  const { data: inserted, error: dbErr } = await db
    .from("session_media")
    .insert({
      session_id:     id,
      media_type:     isVideo ? "video" : "image",
      url:            publicUrl,
      thumbnail_url:  thumbnailUrl ?? (isImage ? publicUrl : null),
      caption:        caption?.trim() || null,
      file_size:      file.size,
      display_order:  totalExisting,
      is_cover:       setAsCover,
      uploader_email: uploaderEmail,
    })
    .select()
    .single();

  if (dbErr) {
    console.error("[media/POST] session_media insert failed", {
      message: dbErr.message, code: dbErr.code,
      details: dbErr.details, hint: dbErr.hint,
    });
    return NextResponse.json(
      { error: `DB error (${dbErr.code ?? "?"}): ${dbErr.message}` },
      { status: 500 },
    );
  }

  // ── 5. Update session cover thumbnail ─────────────────────────────────────
  if (setAsCover) {
    const thumbOrUrl = thumbnailUrl ?? (isImage ? publicUrl : null);
    if (thumbOrUrl) {
      await db.from("sessions").update({ photo_url: thumbOrUrl }).eq("id", id);
    }
    revalidatePath("/");
  }

  return NextResponse.json({ media: inserted }, { status: 201 });
}
