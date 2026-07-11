import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/sessions/[id]/photos  → list photos with like counts
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userEmail = new URL(req.url).searchParams.get("user_email");
    const db = getSupabaseServer();

    const { data: photos, error } = await db
      .from("session_photos")
      .select("id, uploader_email, uploader_name, photo_url, caption, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    const ids = (photos ?? []).map(p => p.id);

    // Fetch all likes for like counts
    const { data: likes } = ids.length
      ? await db.from("photo_likes").select("photo_id, user_email").in("photo_id", ids)
      : { data: [] };

    const likeMap: Record<string, number> = {};
    const userLikedSet = new Set<string>();
    for (const l of likes ?? []) {
      likeMap[l.photo_id] = (likeMap[l.photo_id] ?? 0) + 1;
      if (userEmail && l.user_email === userEmail) userLikedSet.add(l.photo_id);
    }

    const result = (photos ?? []).map(p => ({ ...p, likes: likeMap[p.id] ?? 0, user_liked: userLikedSet.has(p.id) }));
    return NextResponse.json({ photos: result });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/sessions/[id]/photos  → upload a photo
// Body: multipart/form-data  { photo: File, uploader_email, uploader_name, caption? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form   = await req.formData();

    const file           = form.get("photo")          as File | null;
    const uploaderEmail  = form.get("uploader_email") as string | null;
    const uploaderName   = form.get("uploader_name")  as string | null;
    const caption        = form.get("caption")        as string | null;

    if (!file || !uploaderEmail) {
      return NextResponse.json({ error: "photo and uploader_email required" }, { status: 400 });
    }

    const db  = getSupabaseServer();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const key = `${id}/${uploaderEmail.replace("@", "_")}_${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage
      .from("session-photos")
      .upload(key, buf, { contentType: file.type, upsert: false });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: urlData } = db.storage.from("session-photos").getPublicUrl(key);

    const { data, error: dbErr } = await db
      .from("session_photos")
      .insert({
        session_id:     id,
        uploader_email: uploaderEmail,
        uploader_name:  uploaderName ?? uploaderEmail.split("@")[0],
        photo_url:      urlData.publicUrl,
        caption:        caption?.trim() || null,
      })
      .select()
      .single();

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json({ photo: { ...data, likes: 0 } });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
