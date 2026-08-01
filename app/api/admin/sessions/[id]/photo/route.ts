import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { uploadBuffer } from "@/lib/storage";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const ext      = file.name.split(".").pop()?.toLowerCase() || "jpg";
  // Use a timestamp suffix so every upload gets a new URL and Supabase Storage's
  // CDN never serves a stale cached version of the previous group photo.
  const fileName = `${id}/group_${Date.now()}.${ext}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const db = getSupabaseServer();

  let cover_image_url: string;
  try {
    ({ publicUrl: cover_image_url } = await uploadBuffer(db, "session-photos", fileName, buffer, file.type, true));
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Update both cover_image_url and photo_url so the recent-sessions API can display it.
  // cover_image_url: used by admin UI; photo_url: used by the public recent API as fallback.
  const { error: dbErr } = await db
    .from("sessions")
    .update({ cover_image_url, photo_url: cover_image_url })
    .eq("id", id);
  if (dbErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Upsert a cover entry in session_media so the cover map in the recent API is populated.
  await db.from("session_media").update({ is_cover: false }).eq("session_id", id).eq("is_cover", true);
  await db.from("session_media").insert({
    session_id:    id,
    media_type:    "image",
    url:           cover_image_url,
    thumbnail_url: cover_image_url,
    is_cover:      true,
    display_order: 0,
    uploader_email: "admin",
  });

  // revalidatePath("/") invalidates the Next.js page cache for the homepage.
  // Note: revalidatePath on an API path has no effect — the API route uses
  // force-dynamic + explicit no-store headers to prevent all caching.
  revalidatePath("/");

  return NextResponse.json({ success: true, photo_url: cover_image_url, cover_image_url });
}
